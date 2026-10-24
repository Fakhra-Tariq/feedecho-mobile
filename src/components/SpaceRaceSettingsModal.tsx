import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  formatJoinDurationLabel,
  formatQuizDurationLabel,
  SpaceRaceSelectField,
} from '@/components/SpaceRaceSelectField';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import type { SpaceRace } from '@/lib/hostSpaceRaces';
import {
  DURATION_MISMATCH_MSG,
  isAllowedTeamCount,
  isJoinShorterThanQuiz,
  SPACE_RACE_JOIN_MINUTES,
  SPACE_RACE_QUIZ_COUNTDOWNS,
  teamCountChoices,
} from '@/lib/spaceRaceTeams';
import { toParticipantCount } from '@/lib/toParticipantCount';

const ICON_OPTIONS = [
  { value: 'rocket', label: '🚀 Rocket' },
  { value: 'trophy', label: '🏆 Trophy' },
  { value: 'star', label: '⭐ Star' },
  { value: 'flag', label: '🚩 Flag' },
] as const;

type SettingsState = {
  numberOfTeams: number;
  studentsPerTeam: number;
  teamAssignment: 'auto-assign' | 'student-choice' | string;
  icon: string;
  countdown: number;
  joinDuration: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showQuestionFeedback: boolean;
  showFinalScore: boolean;
};

type Props = {
  race: SpaceRace | null;
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (raceId: string, settings: SettingsState) => Promise<void> | void;
  onDelete: (raceId: string) => void;
};

function buildInitial(race: SpaceRace | null): SettingsState {
  const s = race?.settings;
  return {
    numberOfTeams: s?.numberOfTeams || race?.teamsCount || 2,
    studentsPerTeam: Math.min(s?.studentsPerTeam || 5, 6),
    teamAssignment: s?.teamAssignment || 'auto-assign',
    icon: s?.icon || 'rocket',
    countdown: s?.countdown || 300,
    joinDuration: s?.joinDuration || 30,
    shuffleQuestions: s?.shuffleQuestions ?? false,
    shuffleAnswers: s?.shuffleAnswers ?? false,
    showQuestionFeedback: s?.showQuestionFeedback ?? false,
    showFinalScore: s?.showFinalScore ?? false,
  };
}

/**
 * Space Race Settings edit modal — layout mirrors Web SpaceRaceSettings.js.
 * Validation (2–10 teams, join ≥ quiz) unchanged; out-of-range team counts stay selectable until fixed.
 */
export function SpaceRaceSettingsModal({
  race,
  visible,
  busy,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [settings, setSettings] = useState<SettingsState>(() => buildInitial(race));
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && race) {
      setSettings(buildInitial(race));
      setCopied(false);
    }
  }, [visible, race]);

  const teamCountInvalid = !isAllowedTeamCount(settings.numberOfTeams);
  const currentTeamCount = Number(settings.numberOfTeams);
  const durationInvalid = isJoinShorterThanQuiz(settings.joinDuration, settings.countdown);
  const code = race?.joinCode || race?.accessCode || '';

  const teamOptions = useMemo(() => {
    const choices = teamCountChoices().map((count) => ({
      value: count,
      label: `${count} Teams`,
    }));
    if (teamCountInvalid && Number.isFinite(currentTeamCount)) {
      return [{ value: currentTeamCount, label: `${currentTeamCount} Teams` }, ...choices];
    }
    return choices;
  }, [teamCountInvalid, currentTeamCount]);

  const quizDurationOptions = useMemo(() => {
    const base = SPACE_RACE_QUIZ_COUNTDOWNS.map((seconds) => ({
      value: seconds,
      label: formatQuizDurationLabel(seconds),
    }));
    if (!(SPACE_RACE_QUIZ_COUNTDOWNS as readonly number[]).includes(settings.countdown)) {
      return [{ value: settings.countdown, label: formatQuizDurationLabel(settings.countdown) }, ...base];
    }
    return base;
  }, [settings.countdown]);

  const joinDurationOptions = useMemo(() => {
    const base = SPACE_RACE_JOIN_MINUTES.map((minutes) => ({
      value: minutes,
      label: formatJoinDurationLabel(minutes),
    }));
    if (!(SPACE_RACE_JOIN_MINUTES as readonly number[]).includes(settings.joinDuration)) {
      return [{ value: settings.joinDuration, label: formatJoinDurationLabel(settings.joinDuration) }, ...base];
    }
    return base;
  }, [settings.joinDuration]);

  const handleSave = async () => {
    if (!race || durationInvalid || teamCountInvalid || saving) return;
    const raceId = race.id || race.raceId;
    if (!raceId) return;
    setSaving(true);
    try {
      await onSave(raceId, settings);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    const raceId = race?.id || race?.raceId;
    if (!raceId) return;
    onDelete(raceId);
  };

  const copyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!race) return null;

  const participants = toParticipantCount(race.participantsCount, race.participants);
  const teams = race.settings?.numberOfTeams || race.teamsCount || 2;
  const timeLabel = race.timerMinutes
    ? `${race.timerMinutes} min`
    : race.settings?.countdown
      ? formatQuizDurationLabel(race.settings.countdown)
      : 'No limit';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Space Race Settings</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.inkSecondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.codeBlock}>
              <Text style={styles.codeHeading}>Race Code</Text>
              <View style={styles.codeRow}>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText} numberOfLines={2}>
                    {code || 'No code available'}
                  </Text>
                </View>
                <Pressable
                  style={[styles.copyBtn, !code && styles.disabled]}
                  onPress={copyCode}
                  disabled={!code}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Code">
                  <Text style={styles.copyBtnLabel}>{copied ? 'Copied!' : 'Copy Code'}</Text>
                </Pressable>
              </View>
              <Text style={styles.codeHint}>
                This is the original launch code generated when the race was created.
              </Text>
            </View>

            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{race.title || 'Space Race'}</Text>
              <Text style={styles.summarySub}>
                {race.description || 'Live Space Race session'}
              </Text>
              <View style={styles.summaryMeta}>
                <Meta icon="people-outline" label={`${participants} participants`} />
                <Meta icon="time-outline" label={timeLabel} />
                <Meta icon="trophy-outline" label={`${teams} teams`} />
              </View>
            </View>

            <SpaceRaceSelectField
              label="Number of Teams"
              value={settings.numberOfTeams}
              options={teamOptions}
              onChange={(numberOfTeams) => setSettings((prev) => ({ ...prev, numberOfTeams }))}
              error={
                teamCountInvalid ? 'Choose between 2 and 10 teams before saving.' : undefined
              }
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
                hint="Maximum number of audience members allowed in each team"
              />
            ) : null}

            <SpaceRaceSelectField
              label="Quiz Duration"
              value={settings.countdown}
              options={quizDurationOptions}
              onChange={(countdown) => setSettings((prev) => ({ ...prev, countdown }))}
              hint="Time for quiz attempt"
              error={durationInvalid ? DURATION_MISMATCH_MSG : undefined}
            />

            <SpaceRaceSelectField
              label="Join Duration"
              value={settings.joinDuration}
              options={joinDurationOptions}
              onChange={(joinDuration) => setSettings((prev) => ({ ...prev, joinDuration }))}
              hint="Time the audience can join"
              error={durationInvalid ? DURATION_MISMATCH_MSG : undefined}
            />

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Quiz Options</Text>
              <CheckOption
                label="Shuffle questions"
                hint="Randomize question order for each audience member"
                checked={settings.shuffleQuestions}
                onChange={(shuffleQuestions) =>
                  setSettings((prev) => ({ ...prev, shuffleQuestions }))
                }
              />
              <CheckOption
                label="Shuffle answers"
                hint="Randomize answer options for each question"
                checked={settings.shuffleAnswers}
                onChange={(shuffleAnswers) => setSettings((prev) => ({ ...prev, shuffleAnswers }))}
              />
              <CheckOption
                label="Show question feedback"
                hint="Show correct/incorrect feedback after each question"
                checked={settings.showQuestionFeedback}
                onChange={(showQuestionFeedback) =>
                  setSettings((prev) => ({ ...prev, showQuestionFeedback }))
                }
              />
              <CheckOption
                label="Show final score"
                hint="Display final score at the end of the quiz"
                checked={settings.showFinalScore}
                onChange={(showFinalScore) => setSettings((prev) => ({ ...prev, showFinalScore }))}
              />
            </View>

            <SpaceRaceSelectField
              label="Race Icon"
              value={settings.icon}
              options={[...ICON_OPTIONS]}
              onChange={(icon) => setSettings((prev) => ({ ...prev, icon }))}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.deleteBtn}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete Race">
              <Ionicons name="trash-outline" size={16} color={COLORS.primary} />
              <Text style={styles.deleteLabel}>Delete Race</Text>
            </Pressable>
            <View style={styles.footerRight}>
              <Pressable
                style={styles.cancelBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveBtn,
                  (durationInvalid || teamCountInvalid || saving || busy) && styles.disabled,
                ]}
                onPress={handleSave}
                disabled={durationInvalid || teamCountInvalid || saving || busy}
                accessibilityRole="button"
                accessibilityLabel="Save Changes">
                {saving || busy ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.saveLabel}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={COLORS.inkSecondary} />
      <Text style={styles.metaText}>{label}</Text>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  title: { fontSize: 18, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink, flex: 1 },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING[4],
    gap: SPACING[4],
    paddingBottom: SPACING[8],
  },
  codeBlock: {
    backgroundColor: COLORS.blush,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.3)',
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    gap: SPACING[2],
  },
  codeHeading: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.primary, fontSize: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  codeBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.35)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  copyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingHorizontal: SPACING[3],
    justifyContent: 'center',
  },
  copyBtnLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  codeHint: { fontSize: 12, color: COLORS.primary, opacity: 0.85, lineHeight: 16 },
  summary: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    gap: 4,
  },
  summaryTitle: { fontSize: 16, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink },
  summarySub: { fontSize: 13, color: COLORS.inkSecondary },
  summaryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[3], marginTop: SPACING[2] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.inkSecondary },
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
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
    padding: SPACING[4],
    gap: SPACING[3],
    backgroundColor: COLORS.white,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  deleteLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  footerRight: { flexDirection: 'row', gap: SPACING[2] },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceMuted,
  },
  cancelLabel: { color: COLORS.ink, fontWeight: FONT_WEIGHTS.semibold },
  saveBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  saveLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  disabled: { opacity: 0.5 },
});
