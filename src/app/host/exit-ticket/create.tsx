import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, SHADOWS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  cleanErrorMessage,
  showLaunchFailureAlert,
} from '@/lib/activeActivity';
import {
  buildTicketPayload,
  createExitTicket,
  emptyQuestion,
  getExitTicketById,
  LIKERT_OPTIONS,
  normalizeLoadedQuestion,
  QUESTION_TYPE_CATALOG,
  startExitTicket,
  updateExitTicket,
  validateTicketForm,
  type ExitQuestion,
} from '@/lib/hostExitTickets';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

const STEP_LABELS = [
  'Step 1: Enter Title',
  'Step 2: Add Questions',
  'Step 3: Review & Launch',
] as const;

const PLUM = '#6B3A5C';
const PLUM_PRESSED = '#5A2F4D';
const PLUM_DISABLED = '#B99AAD';

export default function CreateExitTicketScreen() {
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editTicketId = edit ? String(edit) : null;
  const { activeSession } = useHostSessions();

  const [step, setStep] = useState(1);
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(editTicketId));
  const [editingTicketId, setEditingTicketId] = useState<string | null>(editTicketId);
  const [saving, setSaving] = useState(false);
  const [launchedCode, setLaunchedCode] = useState('');
  const [title, setTitle] = useState('');
  const [collectAttendance, setCollectAttendance] = useState(true);
  const [questions, setQuestions] = useState<ExitQuestion[]>([emptyQuestion()]);
  const [typePickerIndex, setTypePickerIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!editTicketId) {
      setIsLoadingDraft(false);
      return undefined;
    }

    let cancelled = false;
    setIsLoadingDraft(true);

    (async () => {
      try {
        const ticket = await getExitTicketById(editTicketId);
        if (cancelled) return;
        const loaded =
          Array.isArray(ticket.questions) && ticket.questions.length > 0
            ? ticket.questions.map(normalizeLoadedQuestion)
            : [emptyQuestion()];
        setEditingTicketId(ticket.id || editTicketId);
        setTitle(ticket.title || '');
        setCollectAttendance(ticket.collectAttendance !== false);
        setQuestions(loaded);
      } catch (error) {
        if (cancelled) return;
        showAlert({
          type: 'error',
          title: 'Load failed',
          message: cleanErrorMessage(error, 'Could not load exit ticket'),
          primary: {
            label: 'Close',
            onPress: () => router.replace('/host/exit-ticket' as Href),
          },
        });
      } finally {
        if (!cancelled) setIsLoadingDraft(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editTicketId]);

  /** Web Step 1 Continue: disabled when !title.trim() */
  const canContinueStep1 = Boolean(title.trim());

  /**
   * Web isFormValid / Step 2 Continue + Launch:
   * title.trim, ≥1 question, every prompt.trim, MC ≥2 non-empty options.
   */
  const isFormValid = useMemo(() => {
    if (!title.trim() || questions.length === 0) return false;
    return questions.every((q) => {
      const hasPrompt = Boolean(q.prompt.trim());
      const hasType = Boolean(q.type);
      const hasValidOptions =
        q.type === 'multiple_choice'
          ? (q.options || []).filter((opt) => opt.trim()).length >= 2
          : true;
      return hasPrompt && hasType && hasValidOptions;
    });
  }, [title, questions]);

  const updateQuestion = (index: number, patch: Partial<ExitQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const setQuestionType = (index: number, type: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        if (type === 'multiple_choice') {
          return {
            ...q,
            type,
            options: q.options?.length ? q.options : ['', ''],
          };
        }
        if (type === 'likert') {
          return { ...q, type, options: [...LIKERT_OPTIONS] };
        }
        return { ...q, type, options: [] };
      })
    );
  };

  const onCancel = () => {
    // Web: navigate('/host/exit-tickets') with no confirm — same as stack back.
    router.back();
  };

  const persistDraft = async () => {
    const error = validateTicketForm({ title, questions });
    if (error) {
      showAlert({
        type: 'warning',
        title: 'Incomplete',
        message: error,
        primary: { label: 'Close' },
      });
      return null;
    }
    const payload = buildTicketPayload({ title, collectAttendance, questions });
    if (editingTicketId) {
      return updateExitTicket(editingTicketId, payload);
    }
    const created = await createExitTicket(payload);
    setEditingTicketId(created.id);
    return created;
  };

  const onSaveDraft = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await persistDraft();
      // Navigate immediately (same moment toast appears) — previously waited for OK.
      showToast({
        type: 'success',
        title: 'Saved as draft',
        message: 'Find it under the Draft filter.',
      });
      router.replace('/host/exit-ticket' as Href);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Save failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setSaving(false);
    }
  };

  const onLaunch = async () => {
    if (saving || !isFormValid) return;
    const error = validateTicketForm({ title, questions });
    if (error) {
      showAlert({
        type: 'warning',
        title: 'Incomplete',
        message: error,
        primary: { label: 'Close' },
      });
      return;
    }
    if (!activeSession?.sessionCode) {
      showAlert({
        type: 'warning',
        title: 'No active session',
        message: 'Launching requires an active session. Create one on Explore first.',
        primary: { label: 'Close' },
      });
      return;
    }

    setSaving(true);
    try {
      const saved = await persistDraft();
      if (!saved?.id) throw new Error('Failed to save ticket before launch');
      const launched = await startExitTicket(saved.id);
      setLaunchedCode(launched.joinCode || '');
    } catch (err) {
      showLaunchFailureAlert(activeSession?.currentActivity, err);
    } finally {
      setSaving(false);
    }
  };

  if (isLoadingDraft) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading draft…</Text>
      </View>
    );
  }

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4] + KEYBOARD_BOTTOM_GAP,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Stepper */}
        <View style={styles.stepperCard}>
          <View style={styles.stepperRow}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={styles.stepperSegment}>
                <View
                  style={[
                    styles.stepCircle,
                    step >= n ? styles.stepCircleOn : styles.stepCircleOff,
                  ]}>
                  <Text style={[styles.stepNum, step >= n && styles.stepNumOn]}>{n}</Text>
                </View>
                {n < 3 ? (
                  <View
                    style={[styles.stepLine, step > n ? styles.stepLineOn : styles.stepLineOff]}
                  />
                ) : null}
              </View>
            ))}
          </View>
          <Text style={styles.stepCaption}>{STEP_LABELS[step - 1]}</Text>
        </View>

        {/* Step 1 */}
        {step === 1 ? (
          <View style={styles.mainCard}>
            <Text style={styles.fieldLabelLg}>Exit Ticket Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., End of Class Feedback"
              placeholderTextColor="#8A7F89"
              style={styles.titleInput}
              accessibilityLabel="Exit Ticket Title"
            />

            <View style={styles.attendanceRow}>
              <View style={styles.attendanceCopy}>
                <Text style={styles.attendanceLabel}>
                  Mark attendance when audience members submit
                </Text>
                <Text style={styles.attendanceHint}>
                  Automatically track which audience members attended based on submission
                </Text>
              </View>
              <Switch
                value={collectAttendance}
                onValueChange={setCollectAttendance}
                trackColor={{ true: PLUM, false: '#D9D1D7' }}
                thumbColor={COLORS.white}
                ios_backgroundColor="#D9D1D7"
                accessibilityLabel="Mark attendance when audience members submit"
              />
            </View>

            <View style={styles.btnStack}>
              <Pressable
                onPress={() => canContinueStep1 && setStep(2)}
                disabled={!canContinueStep1}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  !canContinueStep1 && styles.primaryBtnDisabled,
                  canContinueStep1 && pressed && styles.primaryBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityState={{ disabled: !canContinueStep1 }}>
                <Text style={styles.primaryBtnLabel}>Continue</Text>
                <Ionicons name="add" size={18} color={COLORS.white} />
              </Pressable>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.outlineBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.outlineBtnLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Step 2 */}
        {step === 2 ? (
          <View style={styles.mainCard}>
            {questions.map((question, index) => (
              <View key={index} style={styles.questionCard}>
                <View style={styles.qHeader}>
                  <Text style={styles.qTitle}>Question {index + 1}</Text>
                  {questions.length > 1 ? (
                    <Pressable
                      onPress={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                      hitSlop={8}
                      style={styles.removeBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove question ${index + 1}`}>
                      <Ionicons name="close" size={18} color="#B3261E" />
                    </Pressable>
                  ) : null}
                </View>

                <Text style={styles.fieldLabel}>Question Prompt</Text>
                <TextInput
                  value={question.prompt}
                  onChangeText={(value) => updateQuestion(index, { prompt: value })}
                  placeholder="What would you like to ask?"
                  placeholderTextColor="#8A7F89"
                  style={styles.promptInput}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel={`Question ${index + 1} prompt`}
                />

                <Text style={styles.fieldLabel}>Question Type</Text>
                <Pressable
                  onPress={() => setTypePickerIndex(index)}
                  style={styles.typeField}
                  accessibilityRole="button"
                  accessibilityLabel={`Question type, ${
                    QUESTION_TYPE_CATALOG.find((t) => t.value === question.type)?.label ||
                    'Short Text'
                  }`}>
                  <Text style={styles.typeFieldText}>
                    {QUESTION_TYPE_CATALOG.find((t) => t.value === question.type)?.label ||
                      'Short Text'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#5F5460" />
                </Pressable>

                {question.type === 'likert' ? (
                  <View style={styles.likertPreview}>
                    {LIKERT_OPTIONS.map((option) => (
                      <Text key={option} style={styles.likertOption}>
                        • {option}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {question.type === 'multiple_choice' ? (
                  <View style={styles.optionsBlock}>
                    <Text style={styles.fieldLabel}>Options</Text>
                    {(question.options || []).map((option, optionIndex) => (
                      <View key={optionIndex} style={styles.optionRow}>
                        <TextInput
                          value={option}
                          onChangeText={(value) => {
                            const next = [...(question.options || [])];
                            next[optionIndex] = value;
                            updateQuestion(index, { options: next });
                          }}
                          placeholder={`Option ${optionIndex + 1}`}
                          placeholderTextColor="#8A7F89"
                          style={styles.optionInput}
                          accessibilityLabel={`Option ${optionIndex + 1}`}
                        />
                        {(question.options || []).length > 2 ? (
                          <Pressable
                            onPress={() =>
                              updateQuestion(index, {
                                options: (question.options || []).filter((_, j) => j !== optionIndex),
                              })
                            }
                            style={styles.removeBtn}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove option ${optionIndex + 1}`}>
                            <Text style={styles.removeOption}>×</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    <Pressable
                      onPress={() =>
                        updateQuestion(index, {
                          options: [...(question.options || []), ''],
                        })
                      }
                      style={({ pressed }) => [
                        styles.addOptionBtn,
                        pressed && styles.outlineBtnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Add option">
                      <Ionicons name="add" size={16} color="#2B1F27" />
                      <Text style={styles.addOptionLabel}>Add Option</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}

            <Pressable
              onPress={() => setQuestions((prev) => [...prev, emptyQuestion()])}
              style={({ pressed }) => [styles.addQuestionBtn, pressed && styles.outlineBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add Question">
              <Ionicons name="add" size={18} color="#2B1F27" />
              <Text style={styles.addQuestionLabel}>Add Question</Text>
            </Pressable>

            <View style={styles.btnStack}>
              <Pressable
                onPress={() => isFormValid && setStep(3)}
                disabled={!isFormValid}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  !isFormValid && styles.primaryBtnDisabled,
                  isFormValid && pressed && styles.primaryBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityState={{ disabled: !isFormValid }}>
                <Text style={styles.primaryBtnLabel}>Continue</Text>
              </Pressable>
              <View style={styles.twoCol}>
                <Pressable
                  onPress={() => setStep(1)}
                  style={({ pressed }) => [
                    styles.outlineBtn,
                    styles.flex1,
                    pressed && styles.outlineBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Back">
                  <Text style={styles.outlineBtnLabelSm}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={onCancel}
                  style={({ pressed }) => [
                    styles.outlineBtn,
                    styles.flex1,
                    pressed && styles.outlineBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel">
                  <Text style={styles.outlineBtnLabelSm}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {/* Step 3 */}
        {step === 3 ? (
          <View style={styles.mainCard}>
            <View style={styles.reviewInner}>
              <Text style={styles.reviewHeading}>Review Exit Ticket</Text>

              <Text style={styles.reviewSection}>Title</Text>
              <Text style={styles.reviewValue}>{title.trim() || 'Untitled'}</Text>

              <Text style={[styles.reviewSection, { marginTop: 12 }]}>
                Questions ({questions.length})
              </Text>
              {questions.map((q, index) => {
                const typeLabel =
                  QUESTION_TYPE_CATALOG.find((t) => t.value === q.type)?.label || q.type;
                const prompt = q.prompt.trim();
                return (
                  <View key={index} style={styles.reviewQBox}>
                    <Text style={styles.reviewQHead}>
                      Q{index + 1}: {typeLabel}
                    </Text>
                    <Text style={[styles.reviewPrompt, !prompt && styles.reviewPromptEmpty]}>
                      {prompt || '(empty prompt)'}
                    </Text>
                  </View>
                );
              })}

              <Text style={[styles.reviewSection, { marginTop: 12 }]}>Settings</Text>
              <View style={styles.settingsRow}>
                <Ionicons name="people-outline" size={16} color="#5F5460" />
                <Text style={styles.settingsText}>
                  {collectAttendance
                    ? 'Attendance tracking enabled'
                    : 'Attendance tracking disabled'}
                </Text>
              </View>
            </View>

            <View style={[styles.threeCol, { marginTop: 16 }]}>
              <Pressable
                onPress={() => setStep(2)}
                style={({ pressed }) => [
                  styles.outlineBtnSm,
                  styles.flex1,
                  pressed && styles.outlineBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Back">
                <Text style={styles.outlineBtnLabelXs}>Back</Text>
              </Pressable>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.outlineBtnSm,
                  styles.flex1,
                  pressed && styles.outlineBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.outlineBtnLabelXs}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSaveDraft}
                disabled={saving}
                style={({ pressed }) => [
                  styles.outlineBtnSm,
                  styles.flex1,
                  pressed && styles.outlineBtnPressed,
                  saving && styles.dimmed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Draft"
                accessibilityState={{ disabled: saving }}>
                <Text style={styles.outlineBtnLabelXs}>{saving ? '…' : 'Draft'}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onLaunch}
              disabled={saving || !isFormValid}
              style={({ pressed }) => [
                styles.primaryBtn,
                { marginTop: 10 },
                (saving || !isFormValid) && styles.primaryBtnDisabled,
                !(saving || !isFormValid) && pressed && styles.primaryBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Launch Exit Ticket"
              accessibilityState={{ disabled: saving || !isFormValid }}>
              <Text style={styles.primaryBtnLabel}>
                {saving ? 'Launching…' : 'Launch Exit Ticket'}
              </Text>
              {!saving ? <Ionicons name="rocket-outline" size={18} color={COLORS.white} /> : null}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Question type picker modal */}
      <Modal
        visible={typePickerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTypePickerIndex(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setTypePickerIndex(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Question Type</Text>
            {QUESTION_TYPE_CATALOG.map((type) => {
              const selected =
                typePickerIndex !== null && questions[typePickerIndex]?.type === type.value;
              return (
                <Pressable
                  key={type.value}
                  onPress={() => {
                    if (typePickerIndex !== null) {
                      setQuestionType(typePickerIndex, type.value);
                    }
                    setTypePickerIndex(null);
                  }}
                  style={({ pressed }) => [
                    styles.typeOption,
                    pressed && styles.outlineBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={type.label}>
                  <Text style={styles.typeOptionLabel}>{type.label}</Text>
                  {selected ? (
                    <Ionicons name="checkmark" size={20} color={PLUM} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Exit Ticket Created"
        code={launchedCode}
        onClose={() => {
          setLaunchedCode('');
          router.replace('/host/exit-ticket' as Href);
        }}
      />
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F0EA' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F0EA',
    gap: SPACING[3],
  },
  loadingText: { color: COLORS.darkTextSecondary },
  content: {
    paddingTop: 0,
  },
  stepperCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 14,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleOn: { backgroundColor: PLUM },
  stepCircleOff: { backgroundColor: '#E9E4E8' },
  stepNum: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#8A7F89',
  },
  stepNumOn: { color: COLORS.white },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  stepLineOn: { backgroundColor: PLUM },
  stepLineOff: { backgroundColor: '#E9E4E8' },
  stepCaption: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  mainCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 16,
  },
  fieldLabelLg: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    marginBottom: 6,
    marginTop: 4,
  },
  titleInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#2B1F27',
  },
  attendanceRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  attendanceCopy: { flex: 1, minWidth: 0 },
  attendanceLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  attendanceHint: {
    marginTop: 4,
    fontSize: 11,
    color: '#5F5460',
    lineHeight: 15,
  },
  btnStack: {
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: PLUM,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnPressed: { backgroundColor: PLUM_PRESSED },
  primaryBtnDisabled: { backgroundColor: PLUM_DISABLED },
  primaryBtnLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  outlineBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnSm: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  outlineBtnPressed: { backgroundColor: '#F7F2F5' },
  outlineBtnLabel: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  outlineBtnLabelSm: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  outlineBtnLabelXs: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  twoCol: { flexDirection: 'row', gap: 10 },
  threeCol: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  dimmed: { opacity: 0.6 },
  questionCard: {
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  qHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qTitle: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  removeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#2B1F27',
  },
  typeField: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeFieldText: {
    fontSize: 14,
    color: '#2B1F27',
  },
  likertPreview: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  likertOption: { fontSize: 13, color: '#5F5460' },
  optionsBlock: { gap: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#2B1F27',
  },
  removeOption: {
    fontSize: 22,
    color: '#B3261E',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  addOptionBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addOptionLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  addQuestionBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addQuestionLabel: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  reviewInner: {
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
  },
  reviewHeading: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
    marginBottom: 12,
  },
  reviewSection: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  reviewValue: {
    marginTop: 4,
    fontSize: 14,
    color: '#5F5460',
  },
  reviewQBox: {
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
  },
  reviewQHead: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  reviewPrompt: {
    marginTop: 4,
    fontSize: 12,
    color: '#5F5460',
  },
  reviewPromptEmpty: {
    color: '#8A7F89',
  },
  settingsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsText: {
    fontSize: 13,
    color: '#5F5460',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING[5],
    paddingBottom: SPACING[10],
    ...SHADOWS.raised,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
    marginBottom: SPACING[3],
  },
  typeOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFE7EC',
  },
  typeOptionLabel: {
    fontSize: 15,
    color: '#2B1F27',
  },
});
