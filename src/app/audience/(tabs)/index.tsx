import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { SessionCodeBoxes } from '@/components/SessionCodeBoxes';
import { SpaceRaceTeamSelect } from '@/components/SpaceRaceTeamSelect';
import { AppButton, AppCard, PressableCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { stashActivityEntrySource } from '@/lib/audienceHomeNavigation';
import { isCodeJoinGuest } from '@/lib/guestSession';
import {
  getLastAppliedJoinHref,
  hrefToRouterTarget,
  navigateToJoinedActivity,
} from '@/lib/joinSessionNavigation';
import { formatShortDate } from '@/lib/formatLocalDateTime';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import {
  activityHomeSubtitle,
  activityHomeTitle,
  type ActivityItem,
} from '@/lib/studentsActivity';
import {
  resolveExitTicketActivityTitle,
  useExitTicketActivityTitles,
} from '@/lib/useExitTicketActivityTitles';
import { useStudentActivity } from '@/lib/useStudentActivity';

export default function AudienceHomeScreen() {
  const { loading, isStudent, isHost, profile, joinSession, user, portal } = useAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isGuest = isCodeJoinGuest({
    profileGuest: profile?.guest,
    isHost,
    firebaseUid: user?.uid,
  });
  const [classCode, setClassCode] = useState(['', '', '', '', '', '']);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const { items: recent, loading: loadingRecent } = useStudentActivity(5);
  const exitTicketTitles = useExitTicketActivityTitles(recent);
  const [raceData, setRaceData] = useState<any>(null);
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState<{
    trimmedName: string;
    trimmedCode: string;
  } | null>(null);
  const joinInProgressRef = useRef(false);
  const prevCodeLengthRef = useRef(0);

  const executeJoin = useCallback(
    async (code: string, teamId: number | null = null) => {
      if (joinInProgressRef.current) return;
      if (code.length !== 6) {
        setJoinError('Please enter a valid 6-digit code');
        return;
      }

      joinInProgressRef.current = true;
      setJoinError('');
      setJoining(true);
      const trimmedName = profile?.name?.trim() || 'Audience';
      try {
        await stashActivityEntrySource('student');
        const result = await joinSession({ name: trimmedName, code, teamId });

        if (result.needsTeamSelection) {
          setRaceData(result.raceData || { id: result.raceId });
          setPendingJoin({ trimmedName, trimmedCode: code });
          setShowTeamSelection(true);
          return;
        }

        if (!result.success) {
          const fail = result.error || 'Failed to join session. Please try again.';
          if (/already been used on this device/i.test(fail)) return;
          setJoinError(fail);
          return;
        }

        const navigated = await navigateToJoinedActivity(result, 'student');
        if (!navigated) {
          setJoinError('Unsupported or incomplete session activity. Please try again.');
          return;
        }
        setClassCode(['', '', '', '', '', '']);
      } catch {
        setJoinError('Failed to join session. Please try again.');
      } finally {
        setJoining(false);
        joinInProgressRef.current = false;
      }
    },
    [joinSession, profile?.name]
  );

  useEffect(() => {
    const code = classCode.join('');
    const len = code.length;
    if (
      len === 6 &&
      prevCodeLengthRef.current < 6 &&
      profile &&
      !joinInProgressRef.current &&
      !showTeamSelection
    ) {
      executeJoin(code);
    }
    prevCodeLengthRef.current = len;
  }, [classCode, profile, showTeamSelection, executeJoin]);

  if (loading) return null;
  if (isHost) return <Redirect href={'/host' as Href} />;
  if (!isStudent && !isGuest) return <Redirect href="/" />;

  // Guests must never sit on Home/Progress/Study/Profile. Only bounce when
  // this dashboard route is actually focused (not when it sits under Live Chat).
  const onDashboard =
    pathname === '/audience' || pathname === '/audience/' || pathname === '/audience/(tabs)';
  if (isGuest && onDashboard) {
    const activityHref = getLastAppliedJoinHref();
    const to = activityHref ? hrefToRouterTarget(activityHref) : ('/join' as Href);
    console.log('[TEMP DEBUG] audience Home skip dashboard for guest', {
      from: pathname,
      to,
      user: user?.uid || null,
      role: profile?.role,
      portal,
      loading,
      isGuest,
    });
    return <Redirect href={to} />;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.name || 'Audience').split(/\s+/)[0];

  const activityShortDate = (item: ActivityItem) => {
    const fromApi = String(item.shortDate || '').trim();
    if (fromApi && fromApi !== '—' && fromApi !== 'undefined') return fromApi;
    return formatShortDate(item.sortKey || item.submittedAt || item.joinedAt || item.timestamp);
  };

  const cards = [
    {
      title: 'My Quizzes',
      body: 'View your quiz history',
      href: '/audience/quiz-history' as Href,
      icon: 'pencil-outline' as const,
      accent: COLORS.primary,
    },
    {
      title: 'Space Race',
      body: 'View past races & shared resources',
      href: '/audience/space-race-history' as Href,
      icon: 'rocket-outline' as const,
      accent: COLORS.secondary,
    },
  ];

  if (showTeamSelection) {
    return (
      <SpaceRaceTeamSelect
        raceData={raceData}
        isLoading={joining}
        error={joinError}
        onContinue={(teamId) => {
          if (!pendingJoin) {
            setJoinError('Please select a team');
            return;
          }
          setShowTeamSelection(false);
          executeJoin(pendingJoin.trimmedCode, teamId);
        }}
        onBack={() => {
          setShowTeamSelection(false);
          setRaceData(null);
          setPendingJoin(null);
          setJoinError('');
        }}
      />
    );
  }

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4] },
        ]}>
      <AppCard style={styles.hero}>
        <Text style={styles.greeting}>
          {greeting}, {firstName}!
        </Text>
        <Text style={styles.heroBody}>
          Welcome back to your audience dashboard. Track your progress and join live sessions.
        </Text>
      </AppCard>

      <View style={styles.cardGrid}>
        {cards.map((card) => (
          <PressableCard
            key={card.title}
            style={styles.gridCard}
            onPress={() => router.push(card.href)}>
            <View style={[styles.gridIcon, { backgroundColor: COLORS.blush }]}>
              <Ionicons name={card.icon} size={20} color={card.accent} />
            </View>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.body}</Text>
          </PressableCard>
        ))}
      </View>

      <AppCard style={styles.joinCard}>
        <Text style={styles.joinTitle}>Join a Session</Text>
        <Text style={styles.joinHint}>Enter 6-digit code your host shared with you</Text>
        <View style={styles.joinRow}>
          <SessionCodeBoxes
            digits={classCode}
            onChangeDigits={setClassCode}
            disabled={joining}
            onSubmit={() => executeJoin(classCode.join(''))}
          />
          <AppButton
            label={joining ? 'Joining...' : 'Join'}
            loading={joining}
            onPress={() => executeJoin(classCode.join(''))}
            disabled={joining}
            style={styles.joinBtn}
          />
        </View>
        {joinError ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{joinError}</Text>
          </View>
        ) : null}
      </AppCard>

      <AppCard style={styles.activityCard}>
        <Text style={styles.section}>Recent Activity</Text>
        {loadingRecent ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING[4] }} />
        ) : recent.length === 0 ? (
          <Text style={styles.empty}>No recent activity yet. Join a session to get started!</Text>
        ) : (
          recent.map((item, index) => {
            const title =
              item.type === 'exitTicket'
                ? resolveExitTicketActivityTitle(item, exitTicketTitles)
                : activityHomeTitle(item, exitTicketTitles);
            const subtitle = activityHomeSubtitle(item);
            const dateLabel = activityShortDate(item);
            if (!title) return null;
            return (
              <View
                key={String(item.id || `${item.type}-${index}`)}
                style={[
                  styles.activityRow,
                  index === recent.length - 1 && styles.activityRowLast,
                ]}>
                <View style={styles.activityIcon}>
                  <Ionicons
                    name={
                      item.type === 'liveChat' || item.type === 'anonymousChat'
                        ? 'chatbubble-outline'
                        : item.type === 'spaceRace'
                          ? 'rocket-outline'
                          : 'clipboard-outline'
                    }
                    size={18}
                    color="#4B4452"
                  />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  {subtitle ? <Text style={styles.activityMeta}>{subtitle}</Text> : null}
                </View>
                {dateLabel ? <Text style={styles.activityDate}>{dateLabel}</Text> : null}
              </View>
            );
          })
        )}
        <TouchableOpacity
          style={styles.seeAll}
          onPress={() => router.push('/audience/progress' as Href)}>
          <Text style={styles.seeAllText}>See all progress</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </AppCard>

      <PressableCard
        style={styles.studyCard}
        onPress={() => router.push('/audience/study-assistant' as Href)}>
        <View style={styles.studyRow}>
          <View style={styles.gridIcon}>
            <Ionicons name="sparkles-outline" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>AI Study Assistant</Text>
            <Text style={styles.cardBody}>Practice questions and topic help</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.iconMuted} />
        </View>
      </PressableCard>
    </ScrollView>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING[6], paddingBottom: SPACING[16], gap: SPACING[4] },
  hero: {
    ...SHADOWS.raised,
    backgroundColor: COLORS.primary,
  },
  greeting: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING[2],
    fontSize: 14,
    lineHeight: 20,
  },
  cardGrid: { flexDirection: 'row', gap: SPACING[3] },
  gridCard: { flex: 1, ...SHADOWS.raised },
  gridIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  cardTitle: { ...TYPE.bodyStrong, fontSize: 16 },
  cardBody: { ...TYPE.caption, marginTop: 4 },
  joinCard: { ...SHADOWS.raised, borderWidth: 2, borderColor: COLORS.primary },
  joinTitle: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.bold, fontSize: 18 },
  joinHint: { ...TYPE.caption, marginTop: SPACING[1], marginBottom: SPACING[4], color: '#4B5563' },
  joinRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: SPACING[3],
  },
  joinBtn: {
    alignSelf: 'stretch',
    borderRadius: RADIUS.full,
    minHeight: 44,
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginTop: SPACING[3],
  },
  error: { color: COLORS.dangerText, fontSize: 14 },
  activityCard: {
    ...SHADOWS.raised,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 16,
  },
  section: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
    marginBottom: SPACING[3],
  },
  empty: { ...TYPE.caption, paddingVertical: SPACING[4] },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFE7EC',
  },
  activityRowLast: { borderBottomWidth: 0 },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    flexShrink: 1,
  },
  activityMeta: { fontSize: 12, color: '#5F5460', marginTop: 2 },
  activityDate: {
    fontSize: 12,
    color: '#8A7F89',
    flexShrink: 0,
    marginTop: 2,
    maxWidth: '34%',
    textAlign: 'right',
  },
  seeAll: {
    marginTop: SPACING[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium },
  studyCard: { ...SHADOWS.raised },
  studyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
});
