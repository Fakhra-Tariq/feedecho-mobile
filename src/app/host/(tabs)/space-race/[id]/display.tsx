import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { spaceRaceTeamPercentFromSelections } from '@/lib/spaceRaceResultStats';
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

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(hex: string): [number, number, number] {
  const raw = String(hex || '').replace('#', '');
  if (raw.length === 3) {
    return [
      parseInt(raw[0] + raw[0], 16),
      parseInt(raw[1] + raw[1], 16),
      parseInt(raw[2] + raw[2], 16),
    ];
  }
  return [
    parseInt(raw.slice(0, 2), 16) || 0,
    parseInt(raw.slice(2, 4), 16) || 0,
    parseInt(raw.slice(4, 6), 16) || 0,
  ];
}

function mixHex(hex: string, other: [number, number, number], amount: number) {
  const [r, g, b] = parseHexColor(hex);
  const t = Math.max(0, Math.min(1, amount));
  const toHex = (c: number, o: number) =>
    clampByte(c * (1 - t) + o * t).toString(16).padStart(2, '0');
  return `#${toHex(r, other[0])}${toHex(g, other[1])}${toHex(b, other[2])}`;
}

/** Mix a team base color with white so any team (3+) gets matching pastels. */
function pastelFromTeamColor(base: string) {
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  return {
    track: mixHex(base, white, 0.92),
    trackBorder: mixHex(base, white, 0.72),
    fillStart: mixHex(base, white, 0.58),
    fillEnd: mixHex(base, white, 0.38),
    flag: mixHex(base, white, 0.28),
    btnBorder: mixHex(base, white, 0.38),
    btnFill: mixHex(base, white, 0.82),
    text: mixHex(base, black, 0.32),
  };
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
  return spaceRaceTeamPercentFromSelections(node, n).score;
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
  const { width: windowWidth } = useWindowDimensions();
  const hideJoinTimeWords = windowWidth <= 360;
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
          <View style={styles.headerRow}>
            <Text style={styles.raceTitle} numberOfLines={1} ellipsizeMode="tail">
              {raceData.title || 'Space Race'}
            </Text>
            <View style={styles.joinTimeRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.darkTextSecondary} />
              {hideJoinTimeWords ? null : (
                <Text style={styles.joinTimeLabel}>Join Time:</Text>
              )}
              <JoinDurationTimer raceData={raceData} />
            </View>
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
            const pastel = pastelFromTeamColor(style.fill);
            const members = getTeamParticipants(teamId);
            const percentage =
              maxPossibleScore > 0 ? Math.min((score / maxPossibleScore) * 100, 100) : 0;
            const expanded = Boolean(expandedTeams[String(teamId)]);
            const fillWidth = `${percentage}%`;

            return (
              <View key={teamId} style={styles.teamBlock}>
                <View style={styles.teamRow}>
                  <View style={styles.teamNameWrap}>
                    <View style={[styles.dot, { backgroundColor: style.fill }]} />
                    <Text
                      style={[styles.teamName, { color: pastel.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail">
                      {style.label} Team
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleTeamMembers(teamId)}
                    hitSlop={4}
                    style={({ pressed }) => [
                      styles.membersBtn,
                      expanded
                        ? {
                            backgroundColor: pastel.btnFill,
                            borderColor: pastel.btnBorder,
                          }
                        : {
                            backgroundColor: COLORS.white,
                            borderColor: pastel.btnBorder,
                          },
                      pressed && styles.membersBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={
                      expanded
                        ? `Hide members of ${style.label} Team`
                        : `Show members of ${style.label} Team`
                    }>
                    <Ionicons name="people-outline" size={16} color={pastel.text} />
                    <Text style={[styles.membersBtnLabel, { color: pastel.text }]}>
                      {expanded ? 'Hide Members' : 'Show Members'}
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={[
                    styles.track,
                    { backgroundColor: pastel.track, borderColor: pastel.trackBorder },
                  ]}>
                  <LinearGradient
                    colors={[pastel.fillStart, pastel.fillEnd]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[
                      styles.trackFill,
                      {
                        width: fillWidth,
                        minWidth: 42,
                      },
                    ]}>
                    <View style={styles.iconBubble}>
                      <Ionicons name={iconName} size={16} color={pastel.flag} />
                    </View>
                  </LinearGradient>
                </View>

                <View style={styles.statsRow}>
                  <Text style={[styles.statsText, { color: pastel.text }]}>
                    {members.length} participant{members.length === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.statsScore, { color: pastel.text }]}>Score: {score}</Text>
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
    paddingVertical: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  raceTitle: {
    flex: 1,
    minWidth: 0,
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
  joinTimeValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    fontVariant: ['tabular-nums'],
  },
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
  teamBlock: { gap: 8 },
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
    gap: 6,
    paddingHorizontal: 18,
    minHeight: 44,
    height: 44,
    minWidth: 148,
    borderRadius: 16,
    borderWidth: 2,
    flexShrink: 0,
  },
  membersBtnPressed: { opacity: 0.82 },
  membersBtnLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  track: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingLeft: 5,
    paddingRight: 5,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
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
