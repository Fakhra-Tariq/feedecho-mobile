import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const TEAM_STYLES = [
  { fill: '#3B82F6', text: '#1D4ED8', track: '#DBEAFE', border: '#3B82F6', softBg: '#EFF6FF', softBorder: '#BFDBFE', label: 'Blue' },
  { fill: '#EF4444', text: '#B91C1C', track: '#FEE2E2', border: '#EF4444', softBg: '#FEF2F2', softBorder: '#FECACA', label: 'Red' },
  { fill: '#22C55E', text: '#15803D', track: '#DCFCE7', border: '#22C55E', softBg: '#F0FDF4', softBorder: '#BBF7D0', label: 'Green' },
  { fill: '#F59E0B', text: '#B45309', track: '#FEF3C7', border: '#F59E0B', softBg: '#FFFBEB', softBorder: '#FDE68A', label: 'Yellow' },
  { fill: '#A855F7', text: '#7E22CE', track: '#F3E8FF', border: '#A855F7', softBg: '#FAF5FF', softBorder: '#E9D5FF', label: 'Purple' },
  { fill: '#EC4899', text: '#BE185D', track: '#FCE7F3', border: '#EC4899', softBg: '#FDF2F8', softBorder: '#FBCFE8', label: 'Pink' },
  { fill: '#06B6D4', text: '#0E7490', track: '#CFFAFE', border: '#06B6D4', softBg: '#ECFEFF', softBorder: '#A5F3FC', label: 'Cyan' },
  { fill: '#F97316', text: '#C2410C', track: '#FFEDD5', border: '#F97316', softBg: '#FFF7ED', softBorder: '#FED7AA', label: 'Orange' },
  { fill: '#14B8A6', text: '#0F766E', track: '#CCFBF1', border: '#14B8A6', softBg: '#F0FDFA', softBorder: '#99F6E4', label: 'Teal' },
  { fill: '#6366F1', text: '#4338CA', track: '#E0E7FF', border: '#6366F1', softBg: '#EEF2FF', softBorder: '#C7D2FE', label: 'Indigo' },
] as const;

function getTeamStyle(teamId: number) {
  const idx = Math.max(0, (Number(teamId) || 1) - 1);
  return TEAM_STYLES[idx % TEAM_STYLES.length];
}

function raceIonicon(icon?: string): keyof typeof Ionicons.glyphMap {
  switch (String(icon || 'rocket').toLowerCase()) {
    case 'trophy':
      return 'trophy';
    case 'star':
      return 'star';
    case 'flag':
      return 'flag';
    case 'flame':
      return 'flame';
    case 'zap':
      return 'flash';
    default:
      return 'rocket';
  }
}

function readScoreValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value && typeof value === 'object') {
    const score = Number(
      (value as { score?: unknown; teamScore?: unknown; points?: unknown }).score ??
        (value as { teamScore?: unknown }).teamScore ??
        (value as { points?: unknown }).points ??
        0
    );
    return Number.isFinite(score) ? score : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTeamId(value: unknown) {
  if (value == null || value === '') return null;
  const teamId = Number(String(value).replace(/^team_/i, ''));
  return Number.isFinite(teamId) && teamId > 0 ? teamId : null;
}

function normalizeTeamScores(raw: any) {
  const out: Record<number, number> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      if (entry == null) return;
      const teamId = normalizeTeamId(entry?.teamId ?? index);
      if (teamId == null) return;
      out[teamId] = readScoreValue(entry);
    });
    return out;
  }
  if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => {
      const teamId = normalizeTeamId(k);
      if (teamId == null) return;
      out[teamId] = readScoreValue(v);
    });
  }
  return out;
}

function getTeamScoreFromMap(
  scoresMap: Record<number, number>,
  teamScoresRaw: any,
  teamId: number
) {
  const fromMap = scoresMap?.[teamId] ?? scoresMap?.[String(teamId) as unknown as number];
  if (typeof fromMap === 'number' && Number.isFinite(fromMap)) return fromMap;
  if (teamScoresRaw && typeof teamScoresRaw === 'object') {
    const direct =
      teamScoresRaw[teamId] ??
      teamScoresRaw[String(teamId)] ??
      teamScoresRaw[`team_${teamId}`] ??
      teamScoresRaw[`team_${String(teamId)}`];
    if (direct != null) return readScoreValue(direct);
  }
  return typeof fromMap === 'number' ? fromMap : 0;
}

function scoreFromTeamSelection(selectionRoot: any, teamId: number, totalQuestions: number) {
  const n = Number(totalQuestions) || 0;
  if (!selectionRoot || typeof selectionRoot !== 'object' || n <= 0) return 0;
  const node =
    selectionRoot[`team_${teamId}`] ?? selectionRoot[teamId] ?? selectionRoot[String(teamId)];
  if (!node || typeof node !== 'object') return 0;
  const seen = new Set<string>();
  let correctCount = 0;
  Object.entries(node).forEach(([key, value]: [string, any]) => {
    if (!value || !String(key).startsWith('question_')) return;
    if (value.submitted !== true && value.submitted !== 'true') return;
    const questionId = String(key).slice('question_'.length);
    if (!questionId || seen.has(questionId)) return;
    seen.add(questionId);
    if (value.isCorrect === true) correctCount += 1;
  });
  return Math.round((correctCount / n) * 100);
}

function questionsForScoringFromRace(raceData: any, teamScoresRaw: any) {
  const fromQuiz =
    raceData?.quiz?.questions?.length ||
    raceData?.quizQuestions?.length ||
    Number(raceData?.questionsCount) ||
    Number(raceData?.questionCount) ||
    0;
  if (fromQuiz > 0) return fromQuiz;
  if (!teamScoresRaw || typeof teamScoresRaw !== 'object') return 0;
  const values = Array.isArray(teamScoresRaw)
    ? teamScoresRaw.filter(Boolean)
    : Object.values(teamScoresRaw);
  for (const value of values as any[]) {
    const n = Number(value?.totalQuestions);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function JoinDurationTimer({ raceData }: { raceData: any }) {
  const [timeLeft, setTimeLeft] = useState('--:--');

  useEffect(() => {
    if (!raceData) {
      setTimeLeft('--:--');
      return;
    }
    const tick = () => {
      try {
        if (!raceData.startedAt) {
          const joinDurationMinutes = raceData.settings?.joinDuration || 30;
          setTimeLeft(`${joinDurationMinutes}:00`);
          return;
        }
        const now = Date.now();
        const start = new Date(raceData.startedAt).getTime();
        const joinDurationMinutes = raceData.settings?.joinDuration || 30;
        const difference = start + joinDurationMinutes * 60 * 1000 - now;
        if (difference <= 0) {
          setTimeLeft('00:00');
          return;
        }
        const minutes = Math.floor(difference / 1000 / 60);
        const seconds = Math.floor((difference / 1000) % 60);
        setTimeLeft(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      } catch {
        setTimeLeft('--:--');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [raceData]);

  return <Text style={styles.joinTimeValue}>{timeLeft}</Text>;
}

export default function SpaceRaceDisplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raceId = String(id || '');
  const insets = useSafeAreaInsets();
  const [expandedTeams, setExpandedTeams] = useState<Record<string, true>>({});

  const { value: raceRtdb, loading: raceLoading } = useRtdbValue(
    raceId ? `spaceRaces/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );
  const { value: teamScoresRaw } = useRtdbValue(
    raceId ? `space_race_team_scores/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );
  const { value: teamSelectionsRaw } = useRtdbValue(
    raceId ? `space_race_team_selection/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );
  const { list: participantList } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const raceData = useMemo(() => {
    if (!raceRtdb || !raceId) return null;
    return { id: raceId, ...raceRtdb };
  }, [raceRtdb, raceId]);

  const teamScores = useMemo(() => normalizeTeamScores(teamScoresRaw), [teamScoresRaw]);

  const participants = useMemo(
    () =>
      (participantList || []).map((p: any) => ({
        ...p,
        teamId: normalizeTeamId(p.teamId ?? p.team),
        name: p.name || p.studentName || p.displayName || 'Unknown',
        score: Number(p.score) || 0,
      })),
    [participantList]
  );

  const totalQuestions =
    raceData?.quiz?.questions?.length || raceData?.quizQuestions?.length || 0;
  const questionsForScoring =
    questionsForScoringFromRace(raceData, teamScoresRaw) || totalQuestions;
  const maxPossibleScore = 100;
  const teamCount = raceData?.settings?.numberOfTeams || 2;
  const iconName = raceIonicon(raceData?.settings?.icon);

  const getTeamParticipants = (teamId: number) =>
    participants
      .filter((p) => p.teamId != null && String(p.teamId) === String(teamId))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

  const resolveTeamScore = (teamId: number) => {
    const fromRtdb = getTeamScoreFromMap(teamScores, teamScoresRaw, teamId);
    const fromSelection = scoreFromTeamSelection(teamSelectionsRaw, teamId, questionsForScoring);
    const members = getTeamParticipants(teamId);
    const fromMembers = members.reduce((max, m) => Math.max(max, Number(m.score) || 0), 0);
    return Math.max(fromRtdb, fromSelection, fromMembers);
  };

  const toggleTeamMembers = (teamId: number) => {
    const key = String(teamId);
    setExpandedTeams((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: true };
    });
  };

  if (raceLoading && !raceData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!raceData) {
    return (
      <View style={styles.centered}>
        <Text style={styles.missing}>Race not found</Text>
      </View>
    );
  }

  const teams = Array.from({ length: Math.max(2, Math.min(10, Number(teamCount) || 2)) }, (_, i) => {
    const teamId = i + 1;
    return { teamId, score: Math.round(resolveTeamScore(teamId)) };
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[6] },
        ]}>
        <View style={styles.headerCard}>
          <Text style={styles.raceTitle} numberOfLines={3}>
            {raceData.title || 'Space Race'}
          </Text>
          <View style={styles.joinTimeRow}>
            <Ionicons name="time-outline" size={16} color={COLORS.darkTextSecondary} />
            <Text style={styles.joinTimeLabel}>Join Time:</Text>
            <JoinDurationTimer raceData={raceData} />
          </View>
        </View>

        <View style={styles.boardCard}>
          <Text style={styles.boardTitle}>Space Race</Text>
          <Text style={styles.boardSub}>
            Watch your teams compete in real-time
            {totalQuestions > 0 ? ` · ${totalQuestions} questions` : ''}
          </Text>

          {teams.map(({ teamId, score }) => {
            const style = getTeamStyle(teamId);
            const members = getTeamParticipants(teamId);
            const percentage =
              maxPossibleScore > 0 ? Math.min((score / maxPossibleScore) * 100, 100) : 0;
            const expanded = Boolean(expandedTeams[String(teamId)]);
            const iconLeft = Math.min(Math.max(percentage, 8), 92);

            return (
              <View key={teamId} style={styles.teamBlock}>
                <View style={styles.teamRow}>
                  <View style={styles.teamNameWrap}>
                    <View style={[styles.dot, { backgroundColor: style.fill }]} />
                    <Text
                      style={[styles.teamName, { color: style.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {style.label} Team
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleTeamMembers(teamId)}
                    style={[
                      styles.membersBtn,
                      expanded
                        ? {
                            backgroundColor: style.softBg,
                            borderColor: style.softBorder,
                          }
                        : styles.membersBtnIdle,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Show Members">
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={expanded ? style.text : COLORS.darkTextSecondary}
                    />
                    <Text
                      style={[
                        styles.membersBtnLabel,
                        { color: expanded ? style.text : COLORS.darkTextSecondary },
                      ]}>
                      Show Members
                    </Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={expanded ? style.text : COLORS.darkTextSecondary}
                    />
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.track,
                    { backgroundColor: style.track, borderColor: style.border },
                  ]}>
                  <View
                    style={[
                      styles.trackFill,
                      {
                        width: `${percentage}%`,
                        minWidth: percentage > 0 ? 40 : 0,
                        backgroundColor: style.fill,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.iconBubble,
                      { left: `${iconLeft}%`, backgroundColor: style.fill },
                    ]}>
                    <Ionicons name={iconName} size={18} color={COLORS.white} />
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <Text style={[styles.statsText, { color: style.text }]}>
                    {members.length} participant{members.length === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.statsScore, { color: style.text }]}>Score: {score}</Text>
                </View>

                {expanded ? (
                  <View
                    style={[
                      styles.membersPanel,
                      { backgroundColor: style.softBg, borderColor: style.softBorder },
                    ]}>
                    <Text style={[styles.membersHeading, { color: style.text }]}>Team Members</Text>
                    {members.length === 0 ? (
                      <Text style={styles.emptyMembers}>No members yet</Text>
                    ) : (
                      members.map((member, memberIndex) => (
                        <View key={String(member.id || memberIndex)} style={styles.memberRow}>
                          <View style={styles.memberLeft}>
                            <Text style={[styles.memberIndex, { color: style.text }]}>
                              {memberIndex + 1}.
                            </Text>
                            <Text style={styles.memberName} numberOfLines={2}>
                              {member.name}
                            </Text>
                          </View>
                          <Text style={[styles.memberScore, { color: style.text }]}>
                            {Math.round(score)}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING[6],
  },
  missing: { color: COLORS.text, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  scroll: { padding: SPACING[4], gap: SPACING[4] },
  headerCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    gap: SPACING[2],
  },
  raceTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  joinTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  joinTimeLabel: { color: COLORS.darkTextSecondary, fontSize: 14 },
  joinTimeValue: { color: COLORS.text, fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  boardCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    gap: SPACING[5],
  },
  boardTitle: {
    textAlign: 'center',
    color: COLORS.text,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
  },
  boardSub: {
    textAlign: 'center',
    color: COLORS.darkTextSecondary,
    fontSize: 14,
    marginTop: -SPACING[3],
  },
  teamBlock: { gap: SPACING[2] },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  teamNameWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  teamName: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  membersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  membersBtnIdle: {
    backgroundColor: '#F9FAFB',
    borderColor: COLORS.border,
  },
  membersBtnLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  track: {
    height: 52,
    borderRadius: 999,
    borderWidth: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 999,
  },
  iconBubble: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: -18,
    alignItems: 'center',
    justifyContent: 'center',
    top: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  statsText: { fontSize: 13 },
  statsScore: { fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  membersPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING[3],
    gap: SPACING[2],
  },
  membersHeading: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  emptyMembers: { color: COLORS.darkTextSecondary, fontSize: 13 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  memberLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberIndex: { width: 22, fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  memberName: { flex: 1, minWidth: 0, color: COLORS.text, fontWeight: FONT_WEIGHTS.medium },
  memberScore: { fontWeight: FONT_WEIGHTS.bold, fontSize: 14 },
});
