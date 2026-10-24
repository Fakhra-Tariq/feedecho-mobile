import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { AiQuizGeneratorModal } from '@/components/AiQuizGeneratorModal';
import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { LaunchQuizSettingsModal } from '@/components/LaunchQuizSettingsModal';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  AI_GENERATED_QUIZ_SOURCE,
  getQuizEditorTypeParam,
  normalizeQuestionsForEditor,
  type QuizTypeLabel,
} from '@/lib/aiGeneratedQuiz';
import { createQuiz, updateQuiz } from '@/lib/hostQuizzes';

type Props = {
  quizType: QuizTypeLabel;
  initialQuiz?: any | null;
};

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

export function QuizEditorScreen({ quizType, initialQuiz = null }: Props) {
  const { activeSession } = useHostSessions();
  const [title, setTitle] = useState(initialQuiz?.title || '');
  const [questions, setQuestions] = useState<any[]>(
    initialQuiz?.questions?.length
      ? normalizeQuestionsForEditor(initialQuiz.questions, quizType)
      : []
  );
  const [source, setSource] = useState(initialQuiz?.source || '');
  const [quizId, setQuizId] = useState<string | null>(initialQuiz?.id ? String(initialQuiz.id) : null);
  const [saved, setSaved] = useState(Boolean(initialQuiz?.id && !initialQuiz?.isFromPaste));
  const [saving, setSaving] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [launchedCode, setLaunchedCode] = useState('');

  useEffect(() => {
    if (initialQuiz) return;
    AsyncStorage.getItem('editingQuiz').then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.type && getQuizEditorTypeParam(parsed.type) !== getQuizEditorTypeParam(quizType)) {
          return;
        }
        setTitle(parsed.title || '');
        setQuestions(normalizeQuestionsForEditor(parsed.questions || [], quizType));
        setSource(parsed.source || '');
        // Temp client ids (Date.now) must create; only Firebase push keys update.
        const id = parsed.id != null ? String(parsed.id) : '';
        if (id && !parsed.isFromPaste && !/^\d+$/.test(id)) {
          setQuizId(id);
          setSaved(true);
        }
        AsyncStorage.removeItem('editingQuiz');
      } catch {
        // ignore
      }
    });
  }, [initialQuiz, quizType]);

  const heading = useMemo(() => `Create ${quizType} Quiz`, [quizType]);

  const addQuestion = (mixedType?: 'multiple-choice' | 'true-false' | 'short-answer') => {
    setSaved(false);
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
    setSaved(false);
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (index: number) => {
    setSaved(false);
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

  const validate = () => {
    if (!title.trim() || questions.length === 0) {
      validationAlert('Add a quiz title and at least one question before saving.');
      return false;
    }
    if (quizType === 'Multiple Choice') {
      const ok = questions.every(
        (q) =>
          q.questionText?.trim() &&
          q.options?.some((opt: any) => opt.text?.trim()) &&
          q.options?.filter((opt: any) => opt.isCorrect).length === 1
      );
      if (!ok) {
        validationAlert('Complete all questions and select exactly one correct answer.');
        return false;
      }
    }
    if (quizType === 'True / False') {
      const ok = questions.every((q) => q.questionText?.trim() && q.correctAnswer !== null);
      if (!ok) {
        validationAlert('Complete all questions and choose True or False.');
        return false;
      }
    }
    if (quizType === 'Short Answer') {
      const ok = questions.every((q) => q.questionText?.trim() && q.sampleAnswer?.trim());
      if (!ok) {
        validationAlert('Complete all questions and sample answers.');
        return false;
      }
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
      if (!ok) {
        validationAlert('Complete all questions with required information.');
        return false;
      }
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
      setQuizId(savedQuiz.id);
      setSaved(true);
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

  const openLaunch = () => {
    if (!saved || !quizId) {
      showAlert({
        type: 'warning',
        title: 'Save first',
        message: 'Save the quiz before launching.',
        primary: { label: 'Close' },
      });
      return;
    }
    if (!activeSession?.sessionCode) {
      showAlert({
        type: 'warning',
        title: 'No active session',
        message: 'Only one session can be active at a time. Create a session on Explore first.',
        primary: { label: 'Close' },
      });
      return;
    }
    setShowLaunch(true);
  };

  return (
    <>
    <KeyboardSafeScreen
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
        <Text style={styles.heading}>{heading}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondary} onPress={() => setShowAi(true)}>
            <Text style={styles.secondaryLabel}>AI Generator</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primary} onPress={save} disabled={saving}>
            <Text style={styles.primaryLabel}>{saving ? 'Saving…' : saved ? 'Saved' : 'Save Quiz'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.launch} onPress={openLaunch}>
            <Text style={styles.primaryLabel}>Launch Quiz</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Quiz Title</Text>
        <TextInput
          value={title}
          onChangeText={(value) => {
            setSaved(false);
            setTitle(value);
          }}
          placeholder="Enter quiz title"
          placeholderTextColor={COLORS.darkTextSecondary}
          style={styles.input}
        />

        <Text style={styles.section}>Questions</Text>
        {questions.map((question, index) => (
          <View key={question.id || index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Question {index + 1}</Text>
              <TouchableOpacity onPress={() => removeQuestion(index)}>
                <Text style={styles.delete}>Delete</Text>
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

        {quizType === 'Mixed Type' ? (
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
          <TouchableOpacity style={styles.addBtnWide} onPress={() => addQuestion()}>
            <Text style={styles.addLabel}>+ Add Question</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => router.push('/host/library' as Href)}>
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
          setSaved(false);
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
          setLaunchedCode(activeSession?.sessionCode || '');
        }}
      />

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Quiz Created"
        code={launchedCode}
        onClose={() => {
          setLaunchedCode('');
          router.push('/host/library' as Href);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING[4], paddingBottom: SPACING[16], gap: SPACING[3] },
  heading: { color: COLORS.text, fontSize: 26, fontWeight: FONT_WEIGHTS.bold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  primary: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    justifyContent: 'center',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  secondary: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    justifyContent: 'center',
  },
  secondaryLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  launch: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    justifyContent: 'center',
  },
  label: { color: COLORS.text, fontWeight: FONT_WEIGHTS.semibold, marginTop: SPACING[2] },
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
    gap: SPACING[3],
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
  addBtnWide: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  back: {
    marginTop: SPACING[4],
    textAlign: 'center',
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
