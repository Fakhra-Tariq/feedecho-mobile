import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { liveActivityBlocksLaunch } from '@/lib/liveHostActivity';
import { AiQuizGeneratorModal } from '@/components/AiQuizGeneratorModal';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { LaunchQuizSettingsModal } from '@/components/LaunchQuizSettingsModal';
import { QuizEditorHeaderActions } from '@/components/QuizEditorHeaderActions';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import { useQuizEditorDirty } from '@/hooks/useQuizEditorDirty';
import {
  AI_GENERATED_QUIZ_SOURCE,
  getQuizEditorTypeParam,
  normalizeQuestionsForEditor,
  type QuizTypeLabel,
} from '@/lib/aiGeneratedQuiz';
import { createQuiz, updateQuiz } from '@/lib/hostQuizzes';
import { openHostQuizLaunch } from '@/lib/openHostQuizLaunch';
import {
  serializeQuizEditorSnapshot,
  type QuizEditorHeaderMode,
} from '@/lib/quizEditorSnapshot';

type Props = {
  quizType: QuizTypeLabel;
  initialQuiz?: any | null;
  /** Other quiz types keep the AI Generator. Mixed Type creation/edit pass false. */
  showAiGenerator?: boolean;
};

const HOST_LIBRARY_HREF = '/host/library' as Href;

function initialEditorQuestions(initialQuiz: any, quizType: QuizTypeLabel) {
  if (!initialQuiz?.questions?.length) return [];
  return normalizeQuestionsForEditor(initialQuiz.questions, quizType);
}

function blankMcq() {
  return {
    id: Date.now(),
    questionText: '',
    options: [
      { id: 'a', text: '', isCorrect: false },
      { id: 'b', text: '', isCorrect: false },
      { id: 'c', text: '', isCorrect: false },
      { id: 'd', text: '', isCorrect: false },
    ],
  };
}

function blankTf() {
  return { id: Date.now(), questionText: '', correctAnswer: null as boolean | null };
}

function blankShort() {
  return { id: Date.now(), questionText: '', sampleAnswer: '' };
}

function blankMixed(type: 'multiple-choice' | 'true-false' | 'short-answer') {
  if (type === 'multiple-choice') {
    return {
      id: Date.now(),
      type,
      questionText: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
    };
  }
  if (type === 'true-false') {
    return { id: Date.now(), type, questionText: '', correctAnswer: true };
  }
  return { id: Date.now(), type, questionText: '', sampleAnswer: '' };
}

export function QuizEditorScreen({
  quizType,
  initialQuiz = null,
  showAiGenerator = true,
}: Props) {
  const { activeSession, createSession, liveActivity } = useHostSessions();
  const navigation = useNavigation();
  const leaveToLibraryRef = useRef(false);
  const modeRef = useRef<QuizEditorHeaderMode>('create');
  const isSavedEdit = Boolean(initialQuiz?.id && !initialQuiz?.isFromPaste);
  const [title, setTitle] = useState(initialQuiz?.title || '');
  const [questions, setQuestions] = useState<any[]>(() =>
    initialEditorQuestions(initialQuiz, quizType)
  );
  const [source, setSource] = useState(initialQuiz?.source || '');
  const [quizId, setQuizId] = useState<string | null>(initialQuiz?.id ? String(initialQuiz.id) : null);
  const [saving, setSaving] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [createdSessionCode, setCreatedSessionCode] = useState('');
  const [snapshot, setSnapshot] = useState<string | null>(() =>
    isSavedEdit
      ? serializeQuizEditorSnapshot({
          title: initialQuiz.title,
          questions: initialEditorQuestions(initialQuiz, quizType),
          quizType,
        })
      : null
  );
  const persistedId = snapshot ? quizId : null;
  const { mode } = useQuizEditorDirty({
    title,
    questions,
    quizType,
    persistedId,
    snapshot,
  });
  modeRef.current = mode;

  const goToLibraryReplace = useCallback(() => {
    // Allow any in-flight beforeRemove to proceed (must be set BEFORE navigate).
    // Do not no-op on a second tap: earlier attempts set this flag then used a
    // navigation action the quiz stack cannot handle, which trapped the host.
    leaveToLibraryRef.current = true;
    const openLibrary = () => {
      // Library is a sibling tab, not a quiz-stack screen. dismissAll() is
      // POP_TO_TOP on the focused quiz stack (drops create/edit). navigate()
      // then selects `/host/library` (same href as the Library tab).
      if (typeof router.canDismiss === 'function' && router.canDismiss()) {
        router.dismissAll();
      }
      router.navigate(HOST_LIBRARY_HREF);
    };
    // Finish the current beforeRemove tick first; navigating in the same call
    // after preventDefault is ignored by Expo Router 58 removal prevention.
    queueMicrotask(openLibrary);
  }, []);

  const onEditorBack = useCallback(() => {
    // Shared by header arrow, "Back to Library", hardware back, and gestures.
    // Dirty (saved then edited, not re-saved): existing one-screen back.
    // Otherwise (just saved, or no unsaved edits): Library tab.
    if (modeRef.current === 'dirty') {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      router.back();
      return;
    }
    goToLibraryReplace();
  }, [goToLibraryReplace, navigation]);

  useEffect(() => {
    const stopRemove = navigation.addListener('beforeRemove', (e: { preventDefault: () => void; data?: { action?: { type?: string } } }) => {
      if (leaveToLibraryRef.current) return;
      if (modeRef.current === 'dirty') return;
      const type = e.data?.action?.type;
      if (type && type !== 'GO_BACK' && type !== 'POP') return;
      e.preventDefault();
      onEditorBack();
    });
    return () => {
      stopRemove();
    };
  }, [navigation, onEditorBack]);

  useFocusEffect(
    useCallback(() => {
      const hardware = BackHandler.addEventListener('hardwareBackPress', () => {
        if (modeRef.current === 'dirty') return false;
        onEditorBack();
        return true;
      });
      return () => hardware.remove();
    }, [onEditorBack])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      gestureEnabled: true,
      headerLeft: () => (
        <Pressable
          onPress={onEditorBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.header} />
        </Pressable>
      ),
    });
  }, [navigation, onEditorBack]);

  useEffect(() => {
    if (initialQuiz) return;
    AsyncStorage.getItem('editingQuiz').then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.type && getQuizEditorTypeParam(parsed.type) !== getQuizEditorTypeParam(quizType)) {
          return;
        }
        const loadedQuestions = normalizeQuestionsForEditor(parsed.questions || [], quizType);
        setTitle(parsed.title || '');
        setQuestions(loadedQuestions);
        setSource(parsed.source || '');
        // Temp client ids (Date.now) must create; only Firebase push keys update.
        const id = parsed.id != null ? String(parsed.id) : '';
        if (id && !parsed.isFromPaste && !/^\d+$/.test(id)) {
          setQuizId(id);
          setSnapshot(
            serializeQuizEditorSnapshot({
              title: parsed.title || '',
              questions: loadedQuestions,
              quizType,
            })
          );
        }
        AsyncStorage.removeItem('editingQuiz');
      } catch {
        // ignore
      }
    });
  }, [initialQuiz, quizType]);

  const heading = useMemo(() => `Create ${quizType} Quiz`, [quizType]);
  const isMixedType = quizType === 'Mixed Type';
  const allowAiGenerator = showAiGenerator && !isMixedType;

  const emptyHelper = useMemo(() => {
    if (quizType === 'Multiple Choice') {
      return 'Click "Add Question" to start creating your multiple choice quiz';
    }
    if (quizType === 'True / False') {
      return 'Click "Add Question" to start creating your true/false quiz';
    }
    if (quizType === 'Short Answer') {
      return 'Click "Add Question" to start creating your short answer quiz';
    }
    return 'Click "Add Question" to start creating your mixed type quiz';
  }, [quizType]);

  const addQuestion = (mixedType?: 'multiple-choice' | 'true-false' | 'short-answer') => {
    if (quizType === 'Multiple Choice') {
      setQuestions((prev) => [...prev, blankMcq()]);
      return;
    }
    if (quizType === 'True / False') {
      setQuestions((prev) => [...prev, blankTf()]);
      return;
    }
    if (quizType === 'Short Answer') {
      setQuestions((prev) => [...prev, blankShort()]);
      return;
    }
    setQuestions((prev) => [...prev, blankMixed(mixedType || 'multiple-choice')]);
  };

  const updateQuestion = (index: number, patch: Record<string, unknown>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const validationAlert = (message: string) => {
    showAlert({
      type: 'warning',
      title: 'Incomplete',
      message,
      primary: { label: 'Close' },
    });
  };

  const validationError = useMemo(() => {
    if (!title.trim() || questions.length === 0) {
      return 'Add a quiz title and at least one question before saving.';
    }
    if (quizType === 'Multiple Choice') {
      const ok = questions.every(
        (q) =>
          q.questionText?.trim() &&
          q.options?.some((opt: any) => opt.text?.trim()) &&
          q.options?.filter((opt: any) => opt.isCorrect).length === 1
      );
      if (!ok) return 'Complete all questions and select exactly one correct answer.';
    }
    if (quizType === 'True / False') {
      const ok = questions.every((q) => q.questionText?.trim() && q.correctAnswer !== null);
      if (!ok) return 'Complete all questions and choose True or False.';
    }
    if (quizType === 'Short Answer') {
      const ok = questions.every((q) => q.questionText?.trim() && q.sampleAnswer?.trim());
      if (!ok) return 'Complete all questions and sample answers.';
    }
    if (quizType === 'Mixed Type') {
      const ok = questions.every((q) => {
        if (!q.questionText?.trim()) return false;
        if (q.type === 'multiple-choice') {
          return Array.isArray(q.options) && q.options.some((text: string) => String(text).trim());
        }
        if (q.type === 'true-false') return q.correctAnswer !== undefined;
        return Boolean(q.sampleAnswer?.trim());
      });
      if (!ok) return 'Complete all questions with required information.';
    }
    return null;
  }, [title, questions, quizType]);

  const validate = () => {
    if (validationError) {
      validationAlert(validationError);
      return false;
    }
    return true;
  };

  const save = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: '',
      type: quizType,
      questions,
      questionCount: questions.length,
      status: 'Ready',
      launched: false,
    };
    if (source === AI_GENERATED_QUIZ_SOURCE) payload.source = AI_GENERATED_QUIZ_SOURCE;

    try {
      const wasUpdate = Boolean(quizId);
      const savedQuiz = wasUpdate
        ? await updateQuiz(quizId as string, payload)
        : await createQuiz(payload);
      if (!savedQuiz?.id) throw new Error('Failed to save quiz');
      setQuizId(String(savedQuiz.id));
      setSnapshot(serializeQuizEditorSnapshot({ title, questions, quizType }));
      showToast({
        type: 'success',
        title: wasUpdate ? 'Quiz updated' : 'Quiz saved',
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Save failed',
        message: cleanErrorMessage(error, 'Are you logged in as a host?'),
        primary: { label: 'Close' },
      });
    } finally {
      setSaving(false);
    }
  };

  const launchBusy = liveActivityBlocksLaunch(liveActivity, { type: 'quiz', id: quizId });

  const openLaunch = () => {
    if (showLaunch || saving) return;
    const result = openHostQuizLaunch({
      activeSession,
      liveActivity,
      quiz: { id: quizId },
    });
    if (!result.ok) {
      if (result.reason === 'no-session') setShowCreateSession(true);
      return;
    }
    setShowLaunch(true);
  };

  const onCreateSession = useCallback(async () => {
    if (!sessionName.trim()) {
      showAlert({
        type: 'warning',
        title: 'Session name required',
        message: 'Enter a session name.',
        primary: { label: 'Close' },
      });
      return;
    }
    setCreatingSession(true);
    try {
      const session = await createSession(sessionName.trim());
      setShowCreateSession(false);
      setSessionName('');
      setCreatedSessionCode(session.sessionCode);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not create session',
        message: cleanErrorMessage(error, 'Failed to create session'),
        primary: { label: 'Close' },
      });
    } finally {
      setCreatingSession(false);
    }
  }, [createSession, sessionName]);

  return (
    <>
    <KeyboardSafeScreen
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>
          {isMixedType
            ? 'Add your quiz title and start creating questions with different types'
            : 'Add your quiz title and start creating questions'}
        </Text>
        <QuizEditorHeaderActions
          mode={mode}
          saving={saving}
          launchBusy={launchBusy}
          onSave={save}
          onLaunch={openLaunch}
        />

        <View style={styles.titleCard}>
          <Text style={styles.label}>Quiz Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Enter your quiz title..."
            placeholderTextColor={COLORS.darkTextSecondary}
            style={styles.titleInput}
          />
        </View>

        <Text style={styles.section}>Questions</Text>
        {questions.map((question, index) => (
          <View key={question.id || index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Question {index + 1}</Text>
              <TouchableOpacity
                onPress={() => removeQuestion(index)}
                accessibilityRole="button"
                accessibilityLabel="Remove">
                <Text style={styles.delete}>Remove</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={question.questionText}
              onChangeText={(value) => updateQuestion(index, { questionText: value })}
              placeholder="Question text"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
              multiline
            />

            {quizType === 'Multiple Choice' || question.type === 'multiple-choice' ? (
              (question.options || []).map((option: any, optionIndex: number) => {
                const text = typeof option === 'string' ? option : option.text;
                const isCorrect =
                  typeof option === 'string'
                    ? question.correctAnswer === optionIndex
                    : Boolean(option.isCorrect);
                return (
                  <View key={optionIndex} style={styles.optionRow}>
                    <TouchableOpacity
                      style={[styles.radio, isCorrect && styles.radioOn]}
                      onPress={() => {
                        if (quizType === 'Multiple Choice') {
                          updateQuestion(index, {
                            options: question.options.map((item: any, i: number) => ({
                              ...item,
                              isCorrect: i === optionIndex,
                            })),
                          });
                        } else {
                          updateQuestion(index, { correctAnswer: optionIndex });
                        }
                      }}
                    />
                    <TextInput
                      value={text}
                      onChangeText={(value) => {
                        if (quizType === 'Multiple Choice') {
                          updateQuestion(index, {
                            options: question.options.map((item: any, i: number) =>
                              i === optionIndex ? { ...item, text: value } : item
                            ),
                          });
                        } else {
                          const next = [...(question.options || ['', '', '', ''])];
                          next[optionIndex] = value;
                          updateQuestion(index, { options: next });
                        }
                      }}
                      placeholder={`Option ${optionIndex + 1}`}
                      placeholderTextColor={COLORS.darkTextSecondary}
                      style={[styles.input, styles.optionInput]}
                    />
                  </View>
                );
              })
            ) : null}

            {quizType === 'True / False' || question.type === 'true-false' ? (
              <View style={styles.tfRow}>
                {[true, false].map((value) => (
                  <TouchableOpacity
                    key={String(value)}
                    style={[
                      styles.tfBtn,
                      question.correctAnswer === value && styles.tfBtnOn,
                    ]}
                    onPress={() => updateQuestion(index, { correctAnswer: value })}>
                    <Text
                      style={[
                        styles.tfLabel,
                        question.correctAnswer === value && styles.tfLabelOn,
                      ]}>
                      {value ? 'True' : 'False'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {quizType === 'Short Answer' || question.type === 'short-answer' ? (
              <TextInput
                value={question.sampleAnswer}
                onChangeText={(value) => updateQuestion(index, { sampleAnswer: value })}
                placeholder="Sample / correct answer"
                placeholderTextColor={COLORS.darkTextSecondary}
                style={styles.input}
              />
            ) : null}
          </View>
        ))}

        {questions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>No questions yet</Text>
            <Text style={styles.emptyHelper}>{emptyHelper}</Text>
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={() => addQuestion()}
              accessibilityRole="button"
              accessibilityLabel="Add First Question">
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addFirstLabel}>+ Add First Question</Text>
            </TouchableOpacity>
            {allowAiGenerator ? (
              <TouchableOpacity
                style={styles.aiBtn}
                onPress={() => setShowAi(true)}
                accessibilityRole="button"
                accessibilityLabel="AI Generator">
                <Text style={styles.aiBtnLabel}>AI Generator</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : quizType === 'Mixed Type' ? (
          <View style={styles.addRow}>
            <TouchableOpacity style={styles.addBtn} onPress={() => addQuestion('multiple-choice')}>
              <Text style={styles.addLabel}>+ MCQ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => addQuestion('true-false')}>
              <Text style={styles.addLabel}>+ T/F</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => addQuestion('short-answer')}>
              <Text style={styles.addLabel}>+ Short</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.addBlock}>
            <TouchableOpacity
              style={styles.addQuestionBtn}
              onPress={() => addQuestion()}
              accessibilityRole="button"
              accessibilityLabel="Add Question">
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.addQuestionLabel}>+ Add Question</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.aiBtn}
              onPress={() => setShowAi(true)}
              accessibilityRole="button"
              accessibilityLabel="AI Generator">
              <Text style={styles.aiBtnLabel}>AI Generator</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={onEditorBack} accessibilityRole="button">
          <Text style={styles.back}>Back to Library</Text>
        </TouchableOpacity>
    </KeyboardSafeScreen>

      <AiQuizGeneratorModal
        visible={showAi}
        onClose={() => setShowAi(false)}
        onGenerated={(quiz) => {
          setTitle(quiz.title || '');
          setQuestions(normalizeQuestionsForEditor(quiz.questions || [], quizType));
          setSource(quiz.source || AI_GENERATED_QUIZ_SOURCE);
        }}
      />

      <LaunchQuizSettingsModal
        visible={showLaunch}
        quiz={{
          id: quizId || '',
          title,
          type: quizType,
          questions,
        }}
        accessCode={activeSession?.sessionCode || ''}
        onClose={() => setShowLaunch(false)}
        onLaunched={() => {
          setShowLaunch(false);
          goToLibraryReplace();
        }}
      />

      <CreateSessionModal
        visible={showCreateSession}
        title="Create Session"
        value={sessionName}
        onChangeText={setSessionName}
        onCancel={() => {
          setShowCreateSession(false);
          setSessionName('');
        }}
        onSubmit={onCreateSession}
        submitting={creatingSession}
      />

      <ActivityCreatedModal
        visible={Boolean(createdSessionCode)}
        title="Session Created!"
        code={createdSessionCode}
        onClose={() => setCreatedSessionCode('')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING[4], paddingBottom: SPACING[16], gap: SPACING[3] },
  heading: { color: COLORS.text, fontSize: 26, fontWeight: FONT_WEIGHTS.bold },
  subtitle: {
    color: COLORS.inkSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -SPACING[1],
  },
  titleCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    ...SHADOWS.card,
  },
  label: { color: COLORS.text, fontWeight: FONT_WEIGHTS.semibold, marginBottom: SPACING[2] },
  titleInput: {
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: RADIUS.md,
    minHeight: 48,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.cream,
  },
  section: { color: COLORS.text, fontSize: 18, fontWeight: FONT_WEIGHTS.bold, marginTop: SPACING[3] },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  emptyCard: {
    backgroundColor: COLORS.warningSoft,
    borderRadius: 24,
    paddingVertical: SPACING[5],
    paddingHorizontal: SPACING[4],
    alignItems: 'center',
    gap: SPACING[2],
  },
  emptyEmoji: { fontSize: 32, lineHeight: 40 },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  emptyHelper: {
    color: COLORS.inkSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  addFirstBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[4],
  },
  addFirstLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.bold, fontSize: 15 },
  aiBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[4],
    marginTop: SPACING[1],
  },
  aiBtnLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  addBlock: { gap: SPACING[2] },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    gap: SPACING[3],
    ...SHADOWS.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.text, fontWeight: FONT_WEIGHTS.bold },
  delete: { color: COLORS.dangerText, fontWeight: FONT_WEIGHTS.semibold },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  radioOn: { backgroundColor: COLORS.primary },
  optionInput: { flex: 1 },
  tfRow: { flexDirection: 'row', gap: SPACING[2] },
  tfBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tfBtnOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tfLabel: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium },
  tfLabelOn: { color: COLORS.white },
  addRow: { flexDirection: 'row', gap: SPACING[2] },
  addBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addQuestionBtn: {
    width: '100%',
    minHeight: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[4],
  },
  addQuestionLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.bold, fontSize: 15 },
  addLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  back: {
    marginTop: SPACING[4],
    textAlign: 'center',
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
