import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, SHADOWS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  cleanErrorMessage,
  isActivityConflictMessage,
  showLaunchFailureAlert,
} from '@/lib/activeActivity';
import {
  launchQuiz,
  parseOptionalMinutes,
  QUIZ_TIME_MAX_MINUTES,
  QUIZ_TIME_MIN_MINUTES,
  QUIZ_TIME_PRESETS,
  type HostQuiz,
} from '@/lib/hostQuizzes';

/** Same step as Web `QUIZ_TIME_STEP_MINUTES`. */
const QUIZ_TIME_STEP_MINUTES = 5;

type Props = {
  visible: boolean;
  quiz: HostQuiz | null;
  accessCode: string;
  onClose: () => void;
  onLaunched: (quiz: HostQuiz) => void;
};

export function LaunchQuizSettingsModal({
  visible,
  quiz,
  accessCode,
  onClose,
  onLaunched,
}: Props) {
  const insets = useSafeAreaInsets();
  const { activeSession } = useHostSessions();
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [timePerStudent, setTimePerStudent] = useState<number | null>(null);
  const [liveHint, setLiveHint] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleAnswers, setShuffleAnswers] = useState(false);
  const [showFinalScore, setShowFinalScore] = useState(true);
  const [oneAttempt, setOneAttempt] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTimeLimit(null);
    setTimePerStudent(null);
    setLiveHint(false);
    setShuffleQuestions(false);
    setShuffleAnswers(false);
    setShowFinalScore(true);
    setOneAttempt(false);
    setLaunching(false);
    setError(null);
  }, [visible, quiz?.id]);

  const setLive = (next: number | null) => {
    setTimeLimit(next);
    if (next != null && timePerStudent != null && next < timePerStudent) {
      setTimePerStudent(next);
      setLiveHint(true);
      return;
    }
    setLiveHint(false);
  };

  const setAttempt = (next: number | null) => {
    setTimePerStudent(next);
    if (next != null && timeLimit != null && next > timeLimit) {
      setTimeLimit(next);
    }
  };

  const handleLaunch = async () => {
    if (!quiz?.id) return;
    if (!accessCode) {
      setError('You need an active session before launching a quiz.');
      return;
    }

    const now = new Date();
    const quizAvailabilityMinutes = parseOptionalMinutes(timeLimit);
    const timePerStudentMinutes = parseOptionalMinutes(timePerStudent);
    const endTime = quizAvailabilityMinutes
      ? new Date(now.getTime() + quizAvailabilityMinutes * 60 * 1000).toISOString()
      : null;

    setLaunching(true);
    setError(null);
    try {
      const launched = await launchQuiz(quiz.id, {
        accessCode,
        endTime,
        quizAvailabilityMinutes,
        timePerStudentMinutes,
        shuffleQuestions,
        shuffleAnswers,
        showFinalScore,
        oneAttempt,
        launchedAt: now.toISOString(),
      });
      onLaunched(launched);
      onClose();
    } catch (err) {
      const message = cleanErrorMessage(err, 'Failed to launch quiz');
      if (isActivityConflictMessage(message)) {
        showLaunchFailureAlert(activeSession?.currentActivity, err);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeScreen variant="modal" scroll={false} style={styles.screen}>
        <View
          style={[
            styles.sheetWrap,
            {
              paddingTop: Math.max(insets.top, SPACING[3]),
              paddingBottom: Math.max(insets.bottom, SPACING[3]),
            },
          ]}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Quiz Settings</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={COLORS.iconMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.content, { paddingBottom: KEYBOARD_BOTTOM_GAP }]}
              {...KEYBOARD_SCROLL_PROPS}>
              <View style={styles.panel}>
                <MinuteField
                  label="Quiz live for"
                  description="How long the quiz remains live and joinable"
                  value={timeLimit}
                  onChange={setLive}
                  hint={liveHint ? 'Live time cannot be less than attempt time.' : null}
                />
                <MinuteField
                  label="Each audience member gets up to"
                  description="Time each audience member has to attempt the quiz after joining"
                  value={timePerStudent}
                  onChange={setAttempt}
                />

                <ToggleRow
                  label="Shuffle questions"
                  value={shuffleQuestions}
                  onChange={setShuffleQuestions}
                />
                <ToggleRow
                  label="Shuffle answers"
                  value={shuffleAnswers}
                  onChange={setShuffleAnswers}
                />
                <ToggleRow
                  label="Show final score"
                  value={showFinalScore}
                  onChange={setShowFinalScore}
                />
                <ToggleRow label="One attempt only" value={oneAttempt} onChange={setOneAttempt} />
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.launch, launching && styles.disabled]}
                onPress={handleLaunch}
                disabled={launching}
                accessibilityRole="button"
                accessibilityLabel="Launch Quiz">
                {launching ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <View style={styles.launchInner}>
                    <Ionicons name="play" size={16} color={COLORS.white} />
                    <Text style={styles.launchLabel}>Launch Quiz</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardSafeScreen>
    </Modal>
  );
}

function clampMinutes(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < QUIZ_TIME_MIN_MINUTES) return QUIZ_TIME_MIN_MINUTES;
  if (parsed > QUIZ_TIME_MAX_MINUTES) return QUIZ_TIME_MAX_MINUTES;
  return parsed;
}

function MinuteField({
  label,
  description,
  value,
  onChange,
  hint,
}: {
  label: string;
  description: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string | null;
}) {
  const applyChange = (next: string | number | null) => {
    onChange(clampMinutes(next));
  };

  const stepBy = (delta: number) => {
    const current = value == null ? QUIZ_TIME_MIN_MINUTES : Number(value);
    const next = current + delta;
    if (next < QUIZ_TIME_MIN_MINUTES) {
      onChange(null);
      return;
    }
    applyChange(next);
  };

  const handleInputChange = (raw: string) => {
    if (raw === '') {
      onChange(null);
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    applyChange(raw);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.presets}>
        {QUIZ_TIME_PRESETS.map((minutes) => {
          const active = value === minutes;
          return (
            <TouchableOpacity
              key={minutes}
              style={[styles.preset, active && styles.presetActive]}
              onPress={() => onChange(active ? null : minutes)}>
              <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                {minutes} min
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => stepBy(-QUIZ_TIME_STEP_MINUTES)}
          accessibilityLabel={`Decrease ${label}`}>
          <Ionicons name="remove" size={18} color={COLORS.mutedText} />
        </TouchableOpacity>
        <View style={styles.stepInputWrap}>
          <TextInput
            value={value == null ? '' : String(value)}
            onChangeText={handleInputChange}
            onBlur={() => {
              if (value == null) return;
              applyChange(value);
            }}
            placeholder="No limit"
            placeholderTextColor={COLORS.darkTextSecondary}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.stepInput}
          />
          <Text style={styles.minutesLabel}>minutes</Text>
        </View>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => stepBy(QUIZ_TIME_STEP_MINUTES)}
          accessibilityLabel={`Increase ${label}`}>
          <Ionicons name="add" size={18} color={COLORS.mutedText} />
        </TouchableOpacity>
      </View>
      <Text style={styles.description}>{description}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: COLORS.primary, false: COLORS.muted }}
        thumbColor={COLORS.white}
        ios_backgroundColor={COLORS.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  sheetWrap: {
    flex: 1,
    paddingHorizontal: SPACING[4],
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 28,
    overflow: 'hidden',
    ...SHADOWS.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[2],
  },
  title: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: FONT_WEIGHTS.semibold },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  body: { flex: 1 },
  content: { paddingHorizontal: SPACING[5], paddingBottom: SPACING[3] },
  panel: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    padding: SPACING[3],
    gap: SPACING[3],
  },
  field: { gap: 6 },
  label: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium, fontSize: 14 },
  description: { color: COLORS.mutedText, fontSize: 12 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  preset: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    minHeight: 36,
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  presetActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  presetLabel: { color: COLORS.mutedText, fontSize: 12, fontWeight: FONT_WEIGHTS.medium },
  presetLabelActive: { color: COLORS.white, fontWeight: FONT_WEIGHTS.medium },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  stepBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING[2], minWidth: 0 },
  stepInput: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    textAlign: 'center',
    color: COLORS.text,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[3],
  },
  minutesLabel: { color: COLORS.mutedText, fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  hint: { color: COLORS.primary, fontSize: 12 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  toggleLabel: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium, fontSize: 14, flex: 1, paddingRight: 8 },
  error: { color: COLORS.dangerText, marginTop: SPACING[3] },
  footer: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[4],
    gap: SPACING[2],
  },
  launch: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  launchLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 16 },
  cancel: {
    textAlign: 'center',
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.medium,
    paddingVertical: SPACING[2],
  },
  disabled: { opacity: 0.7 },
});
