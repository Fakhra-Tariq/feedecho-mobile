import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useRtdbList } from '@/lib/useRtdb';

type Props = {
  raceData: any;
  isLoading?: boolean;
  error?: string;
  onContinue: (teamId: number) => void;
  onBack: () => void;
};

export function SpaceRaceTeamSelect({ raceData, isLoading, error, onContinue, onBack }: Props) {
  const [selectedTeam, setSelectedTeam] = useState('');
  const raceId = String(raceData?.id || raceData?.raceId || '');
  const { list: participants } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );

  const teamOptions = useMemo(() => {
    const count = Number(raceData?.settings?.numberOfTeams || 2);
    return Array.from({ length: Math.max(2, count) }, (_, i) => i + 1);
  }, [raceData]);

  const maxStudentsPerTeam = Number(raceData?.settings?.studentsPerTeam || 5);

  return (
    <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
      <AppCard style={styles.card}>
        <Text style={styles.title}>Choose your team</Text>
        <Text style={styles.subtitle}>
          Select a team to join (max {maxStudentsPerTeam} participants per team)
        </Text>
        <View style={styles.grid}>
          {teamOptions.map((teamNum) => {
            const currentTeamMembers = participants.filter(
              (p: any) => String(p.teamId) === String(teamNum)
            );
            const isFull = currentTeamMembers.length >= maxStudentsPerTeam;
            const selected = selectedTeam === String(teamNum);
            return (
              <Pressable
                key={teamNum}
                accessibilityRole="button"
                disabled={isFull}
                onPress={() => setSelectedTeam(String(teamNum))}
                style={[
                  styles.teamBtn,
                  selected && styles.teamBtnSelected,
                  isFull && styles.teamBtnFull,
                ]}>
                <Text style={[styles.teamLabel, selected && styles.teamLabelSelected, isFull && styles.teamLabelFull]}>
                  Team {teamNum}
                </Text>
                <Text style={[styles.teamMeta, isFull && styles.teamLabelFull]}>
                  {currentTeamMembers.length}/{maxStudentsPerTeam} audience members
                </Text>
                {isFull ? <Text style={styles.fullLabel}>Full</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <AppButton
          label={isLoading ? 'Joining...' : 'Continue'}
          loading={isLoading}
          disabled={!selectedTeam || isLoading}
          onPress={() => {
            if (!selectedTeam) return;
            onContinue(parseInt(selectedTeam, 10));
          }}
        />
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </AppCard>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING[4],
  },
  card: { ...SHADOWS.raised },
  title: {
    ...TYPE.title,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  subtitle: {
    ...TYPE.caption,
    textAlign: 'center',
    marginBottom: SPACING[6],
    color: COLORS.mutedText,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[3],
    marginBottom: SPACING[6],
  },
  teamBtn: {
    width: '47%',
    flexGrow: 1,
    paddingVertical: SPACING[4],
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  teamBtnSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.blush,
  },
  teamBtnFull: {
    backgroundColor: COLORS.mutedSoft,
    borderColor: COLORS.border,
  },
  teamLabel: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  teamLabelSelected: { color: COLORS.primary },
  teamLabelFull: { color: COLORS.muted },
  teamMeta: {
    fontSize: 12,
    marginTop: 4,
    color: COLORS.mutedText,
  },
  fullLabel: {
    fontSize: 12,
    color: COLORS.dangerText,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginBottom: SPACING[3],
  },
  errorText: { color: COLORS.dangerText, fontSize: 14 },
  backBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[2],
  },
  backText: { color: COLORS.mutedText, fontSize: 14 },
});
