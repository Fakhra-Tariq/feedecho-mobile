import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudienceActivityHeader } from '@/components/Audience/AudienceActivityHeader';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import {
  SPACE_RACE_FAB_BOTTOM_PAD,
  SpaceRaceTeamChatFab,
} from '@/components/Audience/SpaceRaceTeamChatFab';
import { showAlert } from '@/components/feedback';
import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  appendActivityEntrySource,
  useLeaveActivity,
} from '@/lib/audienceHomeNavigation';
import { getRaceByCode, joinSessionUnified, startTeamQuiz } from '@/lib/hostSpaceRaces';
import { bootstrapSpaceRaceQuiz, teamQuizCacheKey } from '@/lib/spaceRaceAudienceQuiz';
import {
  loadSpaceRaceParticipant,
  saveSpaceRaceParticipant,
} from '@/lib/spaceRaceSession';
import { getRaceStatus } from '@/lib/spaceRaceTeams';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';

function isLoggedInAudience(
  profile: { guest?: boolean; uid?: string; email?: string } | null,
  user: { uid?: string; email?: string | null } | null
) {
  if (profile?.guest) return false;
  const uid = user?.uid || profile?.uid;
  const email = user?.email || profile?.email;
  return Boolean(uid && email);
}

/** Join-duration countdown — same formula as Web JoinDurationTimer. */
function JoinDurationTimer({ race }: { race: any }) {
  const [timeLeft, setTimeLeft] = useState('--:--');

  useEffect(() => {
    if (!race) {
      setTimeLeft('--:--');
      return;
    }

    const tick = () => {
      try {
        if (!race.startedAt) {
          const joinDurationMinutes = race.settings?.joinDuration || 30;
          setTimeLeft(`${joinDurationMinutes}:00`);
          return;
        }
        const now = Date.now();
        const start = new Date(race.startedAt).getTime();
        const joinDurationMinutes = race.settings?.joinDuration || 30;
        const endTime = start + joinDurationMinutes * 60 * 1000;
        const difference = endTime - now;
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
  }, [race]);

  return <Text style={styles.timeValue}>{timeLeft}</Text>;
}

export default function AudienceSpaceRaceScreen() {
  const { profile, user } = useAuth();
  const { leave, source } = useLeaveActivity({ headerBack: false });
  const insets = useSafeAreaInsets();
  const [raceEnded, setRaceEnded] = useState(false);
  const params = useLocalSearchParams<{ code?: string; raceId?: string }>();
  const [codeInput, setCodeInput] = useState('');
  const [raceId, setRaceId] = useState<string | null>(params.raceId ? String(params.raceId) : null);
  const [raceMeta, setRaceMeta] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [phase, setPhase] = useState<'join' | 'team' | 'lobby'>('join');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

  const loggedIn = isLoggedInAudience(profile, user);

  const { value: liveRace } = useRtdbValue(raceId ? `spaceRaces/${raceId}` : null, {
    enabled: Boolean(raceId),
  });
  const { list: participants } = useRtdbList(
    raceId ? `space_race_participants/${raceId}` : null,
    { enabled: Boolean(raceId) }
  );
  const { value: liveParticipant } = useRtdbValue(
    raceId && participant?.id ? `space_race_participants/${raceId}/${participant.id}` : null,
    { enabled: Boolean(raceId && participant?.id) }
  );
  const { value: teamTimer } = useRtdbValue(
    raceId && participant?.teamId
      ? `space_race_team_timers/${raceId}/team_${participant.teamId}`
      : null,
    { enabled: Boolean(raceId && participant?.teamId) }
  );

  const race = liveRace || raceMeta;
  const numberOfTeams = race?.settings?.numberOfTeams || race?.teams || 2;
  const studentsPerTeam = race?.settings?.studentsPerTeam || 6;

  const spaceRaceQuizTitle = useMemo(() => {
    const candidates = [race?.quiz?.title, race?.quizTitle, race?.quiz?.name, race?.title];
    for (const value of candidates) {
      if (value && String(value).trim()) return String(value).trim();
    }
    return 'Quiz';
  }, [race]);

  const headerName = (
    participant?.name ||
    profile?.name ||
    'Audience'
  ).trim();

  /** Guest vs account is locked at join time — never attach a guest attempt later. */
  const joinedAsGuest =
    participant?.joinedAsGuest === true ||
    (participant != null &&
      participant.joinedAsGuest !== false &&
      !loggedIn &&
      !participant.studentUid);
  const showGuestChrome = Boolean(joinedAsGuest);

  const hasQuiz = Boolean(
    race?.quizId || race?.quiz?.id || race?.quiz?.questions?.length
  );

  const [quizTimeExpired, setQuizTimeExpired] = useState(false);
  useEffect(() => {
    if (!teamTimer?.endTime) {
      setQuizTimeExpired(false);
      return undefined;
    }
    const checkExpired = () => {
      const end = new Date(teamTimer.endTime).getTime();
      setQuizTimeExpired(Number.isFinite(end) && end <= Date.now());
    };
    checkExpired();
    const interval = setInterval(checkExpired, 1000);
    return () => clearInterval(interval);
  }, [teamTimer?.endTime]);

  const hasAttemptedQuiz = useMemo(() => {
    const me = liveParticipant;
    if (!me) return false;
    const launchId = race?.currentLaunchId;
    if (launchId && me.launchId && String(me.launchId) !== String(launchId)) {
      return false;
    }
    if (race?.startedAt && me.completedAt) {
      const started = new Date(race.startedAt).getTime();
      const completed = new Date(me.completedAt).getTime();
      if (Number.isFinite(started) && Number.isFinite(completed) && completed < started) {
        return false;
      }
    }
    const answers = me.answers;
    const hasPersonalAnswers = Array.isArray(answers)
      ? answers.some((answer: any) => answer && answer.awardedByTeammate !== true)
      : answers && typeof answers === 'object'
        ? Object.values(answers).some((answer: any) => answer && answer.awardedByTeammate !== true)
        : false;
    return Boolean(hasPersonalAnswers) || Boolean(me.completedAt);
  }, [liveParticipant, race?.currentLaunchId, race?.startedAt]);

  useEffect(() => {
    (async () => {
      const fromParam = String(params.code || '')
        .trim()
        .toUpperCase();
      if (fromParam) {
        setCodeInput(fromParam);
        return;
      }
      const stored = await AsyncStorage.getItem(SESSION_CODE_KEY);
      if (stored) setCodeInput(stored.trim().toUpperCase());
    })();
  }, [params.code]);

  useEffect(() => {
    (async () => {
      if (!raceId) return;
      const stored = await loadSpaceRaceParticipant(raceId);
      if (stored) {
        setParticipant(stored);
        setPhase('lobby');
      }
    })();
  }, [raceId]);

  useEffect(() => {
    if (liveParticipant && participant?.id) {
      const lockedGuest = participant.joinedAsGuest === true;
      const updated = {
        ...participant,
        ...liveParticipant,
        id: participant.id,
        joinedAsGuest: lockedGuest ? true : participant.joinedAsGuest,
        studentUid: lockedGuest ? undefined : participant.studentUid ?? liveParticipant.studentUid,
        studentEmail: lockedGuest
          ? undefined
          : participant.studentEmail ?? liveParticipant.studentEmail,
      };
      setParticipant(updated);
      saveSpaceRaceParticipant(updated);
    }
  }, [liveParticipant]);

  useEffect(() => {
    if (getRaceStatus(race) === 'completed') setRaceEnded(true);
  }, [race]);

  const loadRace = async (code: string) => {
    const response = await getRaceByCode(code);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Invalid or inactive Space Race code');
    }
    const data = response.data;
    const id = String(data.id || data.raceId || '');
    if (!id) throw new Error('Race not found');
    setRaceId(id);
    setRaceMeta(data);
    await AsyncStorage.setItem(SESSION_CODE_KEY, code);
    return data;
  };

  const onJoinPress = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) {
      setError('Enter a 6-character code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await loadRace(code);
      if (data.settings?.teamAssignment === 'student-choice') {
        setPhase('team');
      } else {
        await completeJoin(code, null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setBusy(false);
    }
  };

  const completeJoin = async (code: string, teamId: number | null) => {
    const name =
      (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() ||
      profile?.name?.trim() ||
      '';
    if (!name) {
      showAlert({
        type: 'warning',
        title: 'Name required',
        message: 'Join from the landing page with your name first.',
        primary: { label: 'Close' },
      });
      router.replace('/join' as Href);
      return;
    }
    setBusy(true);
    try {
      const studentUid = loggedIn ? user?.uid || profile?.uid || undefined : undefined;
      const studentEmail = loggedIn ? user?.email || profile?.email || undefined : undefined;
      const response = await joinSessionUnified({
        name,
        code,
        teamId,
        studentUid,
        studentEmail,
      });
      if (!response.success && !response.data) {
        throw new Error(response.error || 'Failed to join race');
      }
      const joined = response.data || response;
      const nextParticipant = {
        id: joined.participantId || joined.id || joined.participant?.id,
        name,
        raceId: joined.raceId || raceId,
        teamId: joined.teamId ?? teamId,
        score: joined.score ?? 0,
        studentUid: studentUid || undefined,
        studentEmail: studentEmail || undefined,
        joinedAsGuest: !studentUid,
      };
      if (!nextParticipant.id) throw new Error('Join succeeded but participant id missing');
      const joinedQuiz = joined.quiz;
      if (joinedQuiz) {
        const prepared = bootstrapSpaceRaceQuiz({
          quizData: joinedQuiz,
          raceId: String(nextParticipant.raceId),
          teamId: nextParticipant.teamId,
          participantId: nextParticipant.id,
          raceSettings: joined.settings || race?.settings,
          skipShuffle: false,
        });
        await AsyncStorage.setItem(
          teamQuizCacheKey(nextParticipant.teamId),
          JSON.stringify(prepared)
        );
      }
      await saveSpaceRaceParticipant(nextParticipant);
      setParticipant(nextParticipant);
      if (joined.raceId) setRaceId(String(joined.raceId));
      setPhase('lobby');
    } catch (err) {
      showAlert({
        type: 'error',
        title: 'Join failed',
        message: cleanErrorMessage(err, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  const onConfirmTeam = async () => {
    if (!selectedTeam) {
      showAlert({
        type: 'warning',
        title: 'Pick a team',
        message: 'Select a team with available seats.',
        primary: { label: 'Close' },
      });
      return;
    }
    const code = codeInput.trim().toUpperCase();
    await completeJoin(code, selectedTeam);
  };

  const onStartQuiz = async () => {
    if (!raceId || !participant?.id || !participant?.teamId) return;
    setBusy(true);
    try {
      const startRes: any = await startTeamQuiz(raceId, {
        teamId: Number(participant.teamId),
        participantId: String(participant.id),
      });
      if (startRes?.expired || startRes?.data?.expired) {
        setQuizTimeExpired(true);
        return;
      }
      router.push(
        appendActivityEntrySource(
          `/audience/space-race-quiz?raceId=${raceId}&teamId=${participant.teamId}`,
          source
        ) as Href
      );
    } catch (err) {
      if ((err as any)?.data?.expired) {
        setQuizTimeExpired(true);
        return;
      }
      showAlert({
        type: 'error',
        title: 'Start failed',
        message: cleanErrorMessage(err, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'join') {
    return (
      <KeyboardSafeScreen scroll={false} style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.heading}>Join Space Race</Text>
          <Text style={styles.hint}>Enter the race code from your host</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={codeInput}
            onChangeText={(value) =>
              setCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
            }
            maxLength={6}
            style={styles.codeInput}
            placeholder="6-character code"
            placeholderTextColor={COLORS.darkTextSecondary}
          />
          <TouchableOpacity
            style={[styles.primary, busy && styles.disabled]}
            onPress={onJoinPress}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.primaryLabel}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardSafeScreen>
    );
  }

  if (phase === 'team') {
    const teams = Array.from({ length: numberOfTeams }, (_, i) => i + 1);
    return (
      <View style={styles.screen}>
        <Text style={styles.headingPad}>Choose your team</Text>
        <FlatList
          data={teams}
          keyExtractor={(item) => String(item)}
          contentContainerStyle={styles.list}
          renderItem={({ item: teamId }) => {
            const count = participants.filter((p) => Number(p.teamId) === teamId).length;
            const full = count >= studentsPerTeam;
            const on = selectedTeam === teamId;
            return (
              <TouchableOpacity
                style={[styles.teamPickCard, on && styles.teamPickCardOn, full && styles.disabled]}
                disabled={full}
                onPress={() => setSelectedTeam(teamId)}>
                <Text style={styles.teamPickTitle}>Team {teamId}</Text>
                <Text style={styles.hint}>
                  {count}/{studentsPerTeam} seats{full ? ' · Full' : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity
          style={[styles.primary, styles.footerBtn, busy && styles.disabled]}
          onPress={onConfirmTeam}
          disabled={busy}>
          <Text style={styles.primaryLabel}>{busy ? 'Joining…' : 'Join Team'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AudienceActivityHeader
        title={spaceRaceQuizTitle}
        titleIcon="rocket"
        participantName={headerName}
        isLoggedIn={!showGuestChrome && loggedIn}
        onLogoPress={leave}
      />
      <GuestProgressLoginBanner visible={showGuestChrome} />
      <ScrollView
        contentContainerStyle={[
          styles.welcomeScroll,
          { paddingBottom: SPACE_RACE_FAB_BOTTOM_PAD + insets.bottom + SPACING[6] },
        ]}>
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTop}>
            <View style={styles.welcomeLeft}>
              <Text style={styles.welcomeName} numberOfLines={1}>
                Welcome, {participant?.name || headerName || 'Audience'}
              </Text>
              {participant?.teamId != null ? (
                <View style={styles.teamBadge}>
                  <Ionicons name="flash" size={12} color={COLORS.primary} />
                  <Text style={styles.teamBadgeText}>Team {participant.teamId}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Time left</Text>
              <JoinDurationTimer race={race} />
            </View>
          </View>

          {hasQuiz && !hasAttemptedQuiz && !quizTimeExpired && !raceEnded ? (
            <View style={styles.welcomeActions}>
              <Text style={styles.welcomeCopy}>
                The quiz is ready — start it whenever you're set, and coordinate with your
                teammates along the way.
              </Text>
              <TouchableOpacity
                style={[styles.primary, styles.fullWidth, busy && styles.disabled]}
                onPress={onStartQuiz}
                disabled={busy}>
                <Text style={styles.primaryLabel}>{busy ? 'Starting…' : 'Start Quiz'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {hasQuiz && !hasAttemptedQuiz && quizTimeExpired && !raceEnded ? (
            <View style={styles.welcomeActions}>
              <Text style={styles.welcomeCopy}>
                Time&apos;s up — this quiz is closed and can no longer be opened or attempted.
              </Text>
              <View style={styles.closedChip}>
                <Text style={styles.closedChipText}>Quiz Closed</Text>
              </View>
            </View>
          ) : null}

          {hasAttemptedQuiz && !raceEnded ? (
            <View style={styles.welcomeActions}>
              <Text style={styles.welcomeCopy}>You have already attempted this quiz.</Text>
              <View style={styles.closedChip}>
                <Text style={styles.closedChipText}>Quiz Completed</Text>
              </View>
              <TouchableOpacity style={[styles.primary, styles.fullWidth]} onPress={leave}>
                <Text style={styles.primaryLabel}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {raceEnded ? (
            <View style={styles.welcomeActions}>
              <Text style={styles.welcomeCopy}>
                This Space Race has been ended by the host. You can no longer submit answers.
              </Text>
              <View style={styles.closedChip}>
                <Text style={styles.closedChipText}>Race Ended</Text>
              </View>
              <TouchableOpacity style={[styles.primary, styles.fullWidth]} onPress={leave}>
                <Text style={styles.primaryLabel}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <SpaceRaceTeamChatFab
        raceId={raceId}
        teamId={participant?.teamId}
        participant={participant}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  card: {
    margin: SPACING[4],
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[6],
    gap: SPACING[3],
  },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },
  headingPad: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    padding: SPACING[4],
  },
  hint: { color: COLORS.darkTextSecondary },
  error: {
    color: COLORS.warningText,
    backgroundColor: COLORS.warningSoft,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING[3],
  },
  codeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    minHeight: 52,
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 2,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  disabled: { opacity: 0.6 },
  list: { padding: SPACING[4], paddingBottom: SPACING[4] },
  teamPickCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
    marginBottom: SPACING[3],
  },
  teamPickCardOn: { borderColor: COLORS.primary, backgroundColor: COLORS.blush },
  teamPickTitle: { color: COLORS.text, fontWeight: FONT_WEIGHTS.bold, fontSize: 16 },
  footerBtn: { marginHorizontal: SPACING[4], marginBottom: SPACING[3] },
  welcomeScroll: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
  },
  welcomeCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
  },
  welcomeTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  welcomeLeft: { flex: 1, minWidth: 0 },
  welcomeName: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  teamBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.blush,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  teamBadgeText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.primary,
  },
  timeCol: { alignItems: 'flex-end', flexShrink: 0 },
  timeLabel: { fontSize: 12, color: COLORS.inkSecondary },
  timeValue: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  welcomeActions: { marginTop: SPACING[5], gap: SPACING[3] },
  welcomeCopy: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 20,
  },
  fullWidth: { width: '100%' },
  closedChip: {
    backgroundColor: COLORS.mutedSoft,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedChipText: {
    color: COLORS.mutedText,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
