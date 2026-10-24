import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import {
  formatJoinDurationLabel,
  formatQuizDurationLabel,
  SpaceRaceSelectField,
} from '@/components/SpaceRaceSelectField';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions } from '@/context/HostSessionContext';
import { cleanErrorMessage, showActivityBlockedAlert, showLaunchFailureAlert } from '@/lib/activeActivity';
import { apiRequest } from '@/lib/api';
import {
  buildRacePayload,
  createSpaceRace,
  listSpaceRaces,
  startSpaceRaceCreate,
} from '@/lib/hostSpaceRaces';
import {
  DURATION_MISMATCH_MSG,
  getRaceStatus,
  isAllowedTeamCount,
  isJoinShorterThanQuiz,
  snapJoinUpToQuiz,
  snapQuizDownToJoin,
  SPACE_RACE_JOIN_MINUTES,
  SPACE_RACE_QUIZ_COUNTDOWNS,
  teamCountChoices,
  teamCountRangeError,
} from '@/lib/spaceRaceTeams';

type QuizOption = {
  id: string;
  title?: string;
  questionCount?: number;
  questions?: unknown[];
  status?: string;
};

const ICON_OPTIONS = [
  { value: 'rocket', label: '🚀 Rocket' },
  { value: 'trophy', label: '🏆 Trophy' },
  { value: 'star', label: '⭐ Star' },
  { value: 'flag', label: '🚩 Flag' },
];

export default function CreateSpaceRaceScreen() {
  const { profile } = useAuth();
  const { activeSession } = useHostSessions();
  const [step, setStep] = useState(1);
  const [quizzes, setQuizzes] = useState<QuizOption[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [saving, setSaving] = useState(false);
  const [launchedCode, setLaunchedCode] = useState('');
  const [durationHint, setDurationHint] = useState(false);
  const [settings, setSettings] = useState({
    numberOfTeams: 2,
    teamAssignment: 'auto-assign' as 'auto-assign' | 'student-choice',
    icon: 'rocket',
    countdown: 300,
    joinDuration: 30,
    shuffleQuestions: false,
    shuffleAnswers: false,
    showQuestionFeedback: true,
    showFinalScore: true,
    studentsPerTeam: 3,
  });

  useEffect(() => {
    (async () => {
      try {
        const response = await apiRequest<{ success?: boolean; data?: QuizOption[] }>('/quizzes');
        const rows = (response.data || []).filter(
          (q) => !profile?.uid || (q as { createdBy?: string }).createdBy === profile.uid
        );
        setQuizzes(rows);
      } catch {
        setQuizzes([]);
      } finally {
        setLoadingQuizzes(false);
      }
    })();
  }, [profile?.uid]);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId),
    [quizzes, selectedQuizId]
  );

  const setCountdown = (countdown: number) => {
    setSettings((prev) => {
      if (isJoinShorterThanQuiz(prev.joinDuration, countdown)) {
        setDurationHint(true);
        return { ...prev, countdown, joinDuration: snapJoinUpToQuiz(countdown) };
      }
      setDurationHint(false);
      return { ...prev, countdown };
    });
  };

  const setJoinDuration = (joinDuration: number) => {
    setSettings((prev) => {
      if (isJoinShorterThanQuiz(joinDuration, prev.countdown)) {
        setDurationHint(true);
        return { ...prev, joinDuration, countdown: snapQuizDownToJoin(joinDuration) };
      }
      setDurationHint(false);
      return { ...prev, joinDuration };
    });
  };

  const buildPayload = () => {
    if (!selectedQuiz) throw new Error('Please select a quiz first');
    if (!isAllowedTeamCount(settings.numberOfTeams)) throw new Error(teamCountRangeError);
    if (isJoinShorterThanQuiz(settings.joinDuration, settings.countdown)) {
      throw new Error(DURATION_MISMATCH_MSG);
    }
    return buildRacePayload({
      quizId: selectedQuiz.id,
      title: selectedQuiz.title || 'Space Race',
      ...settings,
    });
  };

  const hasActiveRace = async () => {
    try {
      const rows = await listSpaceRaces();
      const mine = (rows || []).filter(
        (r) => !profile?.uid || String(r.createdBy || '') === profile.uid
      );
      return mine.some((r) => getRaceStatus(r) === 'active');
    } catch {
      return false;
    }
  };

  const onSaveDraft = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createSpaceRace(buildPayload());
      showToast({
        type: 'success',
        title: 'Saved as draft',
        message: 'Find it under the Draft filter.',
      });
      router.replace('/host/space-race' as Href);
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

  const onStart = async () => {
    if (saving) return;
    if (!activeSession?.sessionCode) {
      showAlert({
        type: 'warning',
        title: 'No active session',
        message: 'Create an active session on Explore before launching a Space Race.',
        primary: { label: 'Close' },
      });
      return;
    }
    if (await hasActiveRace()) {
      showActivityBlockedAlert(activeSession?.currentActivity);
      return;
    }
    setSaving(true);
    try {
      const response = await startSpaceRaceCreate(buildPayload());
      const code =
        response.joinCode || response.data?.joinCode || activeSession.sessionCode || '';
      setLaunchedCode(code);
    } catch (error) {
      showLaunchFailureAlert(activeSession?.currentActivity, error);
    } finally {
      setSaving(false);
    }
  };

  const teamOptions = teamCountChoices().map((count) => ({
    value: count,
    label: `${count} Teams`,
  }));

  const quizDurationOptions = SPACE_RACE_QUIZ_COUNTDOWNS.map((seconds) => ({
    value: seconds,
    label: formatQuizDurationLabel(seconds),
  }));

  const joinDurationOptions = SPACE_RACE_JOIN_MINUTES.map((minutes) => ({
    value: minutes,
    label: formatJoinDurationLabel(minutes),
  }));

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <View style={styles.stepHeader}>
        <View style={styles.steps}>
          <StepDot n={1} label="Choose Quiz" active={step === 1} done={step > 1} />
          <View style={[styles.stepLine, step === 2 && styles.stepLineOn]} />
          <StepDot n={2} label="Settings" active={step === 2} done={false} />
        </View>
      </View>

      {step === 1 ? (
        loadingQuizzes ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading library quizzes…</Text>
          </View>
        ) : (
          <FlatList
            data={quizzes}
            keyExtractor={(item) => item.id}
            {...KEYBOARD_SCROLL_PROPS}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.sectionHeading}>Select a Quiz</Text>}
            ListEmptyComponent={
              <View style={styles.emptyBlock}>
                <Text style={styles.empty}>No quizzes available</Text>
                <Text style={styles.emptySub}>Create some quizzes in Library first</Text>
              </View>
            }
            renderItem={({ item }) => {
              const on = selectedQuizId === item.id;
              const qCount = item.questionCount || item.questions?.length || 0;
              const status = item.status || 'ready';
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.quizCard,
                    on && styles.quizCardOn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setSelectedQuizId(item.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={item.title || 'Untitled Quiz'}>
                  <View style={styles.quizCopy}>
                    <Text style={styles.quizTitle}>{item.title || 'Untitled Quiz'}</Text>
                    <Text style={styles.meta}>
                      {qCount} questions • {status}
                    </Text>
                  </View>
                  <View style={[styles.radioOuter, on && styles.radioOuterOn]}>
                    {on ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            }}
            ListFooterComponent={
              <View style={styles.step1Footer}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primary,
                    !selectedQuizId && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  disabled={!selectedQuizId}
                  onPress={() => setStep(2)}
                  accessibilityRole="button"
                  accessibilityLabel="Next">
                  <Text style={styles.primaryLabel}>Next</Text>
                </Pressable>
                <Pressable
                  style={styles.ghost}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel">
                  <Text style={styles.ghostLabel}>Cancel</Text>
                </Pressable>
              </View>
            }
          />
        )
      ) : (
        <ScrollView
          {...KEYBOARD_SCROLL_PROPS}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionHeading}>Space Race Settings</Text>

          <SpaceRaceSelectField
            label="Number of Teams"
            value={settings.numberOfTeams}
            options={teamOptions}
            onChange={(numberOfTeams) => setSettings((prev) => ({ ...prev, numberOfTeams }))}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Team Assignment</Text>
            <Radio
              label="Auto-assign"
              selected={settings.teamAssignment === 'auto-assign'}
              onPress={() => setSettings((prev) => ({ ...prev, teamAssignment: 'auto-assign' }))}
            />
            <Radio
              label="Audience Choice"
              selected={settings.teamAssignment === 'student-choice'}
              onPress={() =>
                setSettings((prev) => ({ ...prev, teamAssignment: 'student-choice' }))
              }
            />
          </View>

          {settings.teamAssignment === 'student-choice' ? (
            <SpaceRaceSelectField
              label="No. of participants per team"
              value={settings.studentsPerTeam}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
              onChange={(studentsPerTeam) =>
                setSettings((prev) => ({ ...prev, studentsPerTeam }))
              }
              hint="Maximum audience members allowed per team"
            />
          ) : null}

          <SpaceRaceSelectField
            label="Quiz Duration"
            value={settings.countdown}
            options={quizDurationOptions}
            onChange={setCountdown}
            hint="Time for quiz attempt"
            error={durationHint ? DURATION_MISMATCH_MSG : undefined}
          />

          <SpaceRaceSelectField
            label="Join Duration"
            value={settings.joinDuration}
            options={joinDurationOptions}
            onChange={setJoinDuration}
            hint="Time the audience can join"
            error={durationHint ? DURATION_MISMATCH_MSG : undefined}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Quiz Options</Text>
            <CheckOption
              label="Shuffle Questions"
              hint="Randomize question order for each audience member"
              checked={settings.shuffleQuestions}
              onChange={(shuffleQuestions) =>
                setSettings((prev) => ({ ...prev, shuffleQuestions }))
              }
            />
            <CheckOption
              label="Shuffle Answers"
              hint="Randomize answer options for each question"
              checked={settings.shuffleAnswers}
              onChange={(shuffleAnswers) => setSettings((prev) => ({ ...prev, shuffleAnswers }))}
            />
            <CheckOption
              label="Show Question Feedback"
              hint="Show correct/incorrect feedback after each question"
              checked={settings.showQuestionFeedback}
              onChange={(showQuestionFeedback) =>
                setSettings((prev) => ({ ...prev, showQuestionFeedback }))
              }
            />
            <CheckOption
              label="Show Final Score"
              hint="Display final score at the end of the quiz"
              checked={settings.showFinalScore}
              onChange={(showFinalScore) => setSettings((prev) => ({ ...prev, showFinalScore }))}
            />
          </View>

          <SpaceRaceSelectField
            label="Race Icon"
            value={settings.icon}
            options={ICON_OPTIONS}
            onChange={(icon) => setSettings((prev) => ({ ...prev, icon }))}
          />

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.primary,
                saving && styles.disabled,
                pressed && styles.pressed,
              ]}
              onPress={onStart}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Launch">
              <Text style={styles.primaryLabel}>{saving ? 'Working…' : 'Launch'}</Text>
            </Pressable>
            {!activeSession?.sessionCode ? (
              <Text style={styles.launchHint}>Requires an active session</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.secondary,
                saving && styles.disabled,
                pressed && styles.pressed,
              ]}
              onPress={onSaveDraft}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Save as Draft">
              <Text style={styles.secondaryLabel}>Save as Draft</Text>
            </Pressable>

            <View style={styles.navRow}>
              <Pressable
                style={styles.ghostFlex}
                onPress={() => setStep(1)}
                accessibilityRole="button"
                accessibilityLabel="Previous">
                <Text style={styles.ghostLabel}>Previous</Text>
              </Pressable>
              <Pressable
                style={styles.ghostFlex}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.ghostLabel}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Space Race Created"
        code={launchedCode}
        onClose={() => {
          setLaunchedCode('');
          router.replace('/host/space-race' as Href);
        }}
      />
    </KeyboardSafeScreen>
  );
}

function StepDot({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  const on = active || done;
  return (
    <View style={styles.stepItem}>
      <View style={[styles.stepDot, on && styles.stepDotOn]}>
        <Text style={[styles.stepNum, on && styles.stepNumOn]}>{n}</Text>
      </View>
      <Text style={[styles.stepLabel, active && styles.stepLabelOn]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Radio({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.radioRow}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckOption({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      style={styles.checkBlock}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}>
      <View style={styles.checkRow}>
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Ionicons name="checkmark" size={14} color={COLORS.white} /> : null}
        </View>
        <Text style={styles.checkLabel}>{label}</Text>
      </View>
      <Text style={styles.checkHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  stepHeader: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[3],
  },
  steps: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.mutedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: COLORS.primary },
  stepNum: { color: COLORS.inkSecondary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  stepNumOn: { color: COLORS.white },
  stepLabel: { fontSize: 13, color: COLORS.inkSecondary, fontWeight: FONT_WEIGHTS.medium },
  stepLabelOn: { color: COLORS.primary },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.divider,
    marginHorizontal: SPACING[2],
    minWidth: 12,
  },
  stepLineOn: { backgroundColor: COLORS.primary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING[3] },
  loadingText: { color: COLORS.inkSecondary, fontSize: 14 },
  list: { padding: SPACING[4], paddingBottom: SPACING[16], gap: SPACING[2] },
  content: { padding: SPACING[4], paddingBottom: SPACING[16], gap: SPACING[4] },
  sectionHeading: {
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ink,
    marginBottom: SPACING[1],
  },
  emptyBlock: { alignItems: 'center', paddingVertical: SPACING[10] },
  empty: { textAlign: 'center', color: COLORS.inkSecondary, fontSize: 15 },
  emptySub: { textAlign: 'center', color: COLORS.inkSecondary, fontSize: 13, marginTop: 4 },
  quizCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    marginBottom: SPACING[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    minHeight: 64,
  },
  quizCardOn: { borderColor: COLORS.primary, backgroundColor: COLORS.blush },
  quizCopy: { flex: 1, minWidth: 0 },
  quizTitle: { color: COLORS.ink, fontWeight: FONT_WEIGHTS.semibold, fontSize: 15 },
  meta: { color: COLORS.inkSecondary, marginTop: 4, fontSize: 13 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: { borderColor: COLORS.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  section: { gap: SPACING[2] },
  sectionLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.inkSecondary,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    minHeight: 44,
  },
  radioLabel: { fontSize: 14, color: COLORS.ink },
  checkBlock: { gap: 4, paddingVertical: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], minHeight: 36 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { fontSize: 14, color: COLORS.ink },
  checkHint: { fontSize: 12, color: COLORS.inkSecondary, marginLeft: 32, lineHeight: 16 },
  actions: { gap: SPACING[2], marginTop: SPACING[2] },
  primary: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 15 },
  launchHint: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    marginTop: -4,
  },
  secondary: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  secondaryLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  navRow: { flexDirection: 'row', gap: SPACING[2] },
  ghost: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostFlex: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceMuted,
  },
  ghostLabel: { color: COLORS.ink, fontWeight: FONT_WEIGHTS.semibold },
  step1Footer: { marginTop: SPACING[4], gap: SPACING[2] },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
