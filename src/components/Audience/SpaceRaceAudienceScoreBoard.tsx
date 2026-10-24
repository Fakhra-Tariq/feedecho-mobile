import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { teamScoreFromNode } from '@/lib/spaceRaceTeams';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const TEAM_STYLES = [
  { fill: '#3B82F6', text: '#1D4ED8', track: '#DBEAFE', border: '#3B82F6', label: 'Blue' },
  { fill: '#EF4444', text: '#B91C1C', track: '#FEE2E2', border: '#EF4444', label: 'Red' },
  { fill: '#22C55E', text: '#15803D', track: '#DCFCE7', border: '#22C55E', label: 'Green' },
  { fill: '#F59E0B', text: '#B45309', track: '#FEF3C7', border: '#F59E0B', label: 'Yellow' },
  { fill: '#A855F7', text: '#7E22CE', track: '#F3E8FF', border: '#A855F7', label: 'Purple' },
  { fill: '#EC4899', text: '#BE185D', track: '#FCE7F3', border: '#EC4899', label: 'Pink' },
  { fill: '#06B6D4', text: '#0E7490', track: '#CFFAFE', border: '#06B6D4', label: 'Cyan' },
  { fill: '#F97316', text: '#C2410C', track: '#FFEDD5', border: '#F97316', label: 'Orange' },
  { fill: '#14B8A6', text: '#0F766E', track: '#CCFBF1', border: '#14B8A6', label: 'Teal' },
  { fill: '#6366F1', text: '#4338CA', track: '#E0E7FF', border: '#6366F1', label: 'Indigo' },
];

function teamStyle(teamId: number | string) {
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

export function SpaceRaceAudienceScoreBoard({
  raceId,
  race,
  compact = false,
}: {
  raceId: string | null;
  race?: any;
  compact?: boolean;
}) {
  const { list: participants } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );
  const { value: teamScoresRaw } = useRtdbValue(
    raceId ? `space_race_team_scores/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const numberOfTeams = race?.settings?.numberOfTeams || race?.teams || 2;
  const iconName = raceIonicon(race?.settings?.icon);

  const rows = useMemo(() => {
    const teams = Math.max(2, Math.min(10, Number(numberOfTeams) || 2));
    const out = [];
    for (let teamId = 1; teamId <= teams; teamId += 1) {
      const fromScores = teamScoreFromNode(teamScoresRaw?.[`team_${teamId}`]);
      const members = participants.filter((p) => Number(p.teamId) === teamId);
      const fromMembers = members.reduce(
        (max, p) => Math.max(max, typeof p.score === 'number' ? p.score : 0),
        0
      );
      out.push({
        teamId,
        score: Math.round(Math.max(fromScores, fromMembers)),
        members: members.length,
      });
    }
    return out;
  }, [numberOfTeams, participants, teamScoresRaw]);

  const maxScore = Math.max(1, ...rows.map((r) => r.score));

  if (compact) {
    return (
      <View style={styles.compactWrap}>
        {rows.map((row) => {
          const style = teamStyle(row.teamId);
          const pct = Math.min(100, (row.score / maxScore) * 100);
          return (
            <View key={row.teamId} style={styles.compactCard}>
              <View style={styles.compactHead}>
                <Text style={[styles.compactName, { color: style.text }]} numberOfLines={1}>
                  {style.label}
                </Text>
                <Text style={[styles.compactScore, { color: style.text }]}>{row.score}</Text>
              </View>
              <View style={[styles.compactTrack, { backgroundColor: style.track }]}>
                <View
                  style={[styles.compactFill, { width: `${pct}%`, backgroundColor: style.fill }]}
                />
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.board}>
      <Text style={styles.boardTitle}>Space Race</Text>
      <Text style={styles.boardSub}>Watch your teams compete in real-time</Text>
      {rows.map((row) => {
        const style = teamStyle(row.teamId);
        const pct = Math.min(100, (row.score / maxScore) * 100);
        return (
          <View key={row.teamId} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={styles.nameRow}>
                <View style={[styles.dot, { backgroundColor: style.fill }]} />
                <Text style={[styles.teamName, { color: style.text }]}>
                  {style.label} Team
                </Text>
              </View>
              <Text style={[styles.bigScore, { color: style.text }]}>{row.score}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: style.track, borderColor: style.border }]}>
              <View
                style={[
                  styles.trackFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: style.fill,
                    minWidth: pct > 0 ? 40 : 0,
                  },
                ]}
              />
              <View
                style={[
                  styles.iconWrap,
                  {
                    left: `${pct}%`,
                    backgroundColor: style.fill,
                  },
                ]}>
                <Ionicons name={iconName} size={18} color={COLORS.white} />
              </View>
            </View>
            <View style={styles.statsRow}>
              <Text style={{ color: style.text, fontSize: 13 }}>
                {row.members} participant{row.members === 1 ? '' : 's'}
              </Text>
              <Text style={{ color: style.text, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold }}>
                Score: {row.score}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  compactCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[2],
    minWidth: 140,
  },
  compactHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  compactName: { fontSize: 12, fontWeight: FONT_WEIGHTS.semibold, flex: 1 },
  compactScore: { fontSize: 14, fontWeight: FONT_WEIGHTS.bold },
  compactTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  compactFill: { height: 6, borderRadius: 999 },
  board: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    gap: SPACING[4],
    marginTop: SPACING[4],
  },
  boardTitle: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  boardSub: { textAlign: 'center', color: COLORS.inkSecondary, fontSize: 13, marginTop: -8 },
  row: { gap: SPACING[2] },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING[2],
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  teamName: { fontSize: 16, fontWeight: FONT_WEIGHTS.semibold, flexShrink: 1 },
  bigScore: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  track: {
    height: 48,
    borderRadius: 999,
    borderWidth: 2,
    overflow: 'visible',
    justifyContent: 'center',
  },
  trackFill: { height: '100%', borderRadius: 999 },
  iconWrap: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: -18,
    alignItems: 'center',
    justifyContent: 'center',
    top: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
