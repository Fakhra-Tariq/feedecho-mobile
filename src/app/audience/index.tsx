import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { AppButton, AppCard, PressableCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { stashActivityEntrySource } from '@/lib/audienceHomeNavigation';
import { navigateToJoinedActivity } from '@/lib/joinSessionNavigation';
import { getStudentActivity, type ActivityItem } from '@/lib/studentsActivity';

export default function AudienceHomeScreen() {
  const { loading, isStudent, isHost, profile, joinSession } = useAuth();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [recent, setRecent] = useState<ActivityItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    (async () => {
      setLoadingRecent(true);
      try {
        const data = await getStudentActivity({
          uid: profile?.uid || undefined,
          email: profile?.email || undefined,
          name: profile?.name || undefined,
          limit: 5,
        });
        setRecent(data);
      } catch {
        setRecent([]);
      } finally {
        setLoadingRecent(false);
      }
    })();
  }, [profile?.uid, profile?.email, profile?.name]);

  if (loading) return null;
  if (isHost) return <Redirect href={'/host' as Href} />;
  if (!isStudent) return <Redirect href="/" />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.name || 'Audience').split(/\s+/)[0];

  const onJoin = async () => {
    if (joining) return;
    setJoinError('');
    setJoining(true);
    await stashActivityEntrySource('student');
    const result = await joinSession({ name: profile?.name || 'Audience', code });
    setJoining(false);
    if (!result.success) {
      setJoinError(result.error || 'Failed to join session.');
      return;
    }
    const navigated = await navigateToJoinedActivity(result, 'student');
    if (!navigated) {
      setJoinError('Unsupported or incomplete session activity. Please try again.');
      return;
    }
    setCode('');
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

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
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
        <TextInput
          value={code}
          onChangeText={(value) =>
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
          }
          autoCapitalize="characters"
          maxLength={6}
          placeholder="ABCDEF"
          placeholderTextColor={COLORS.darkTextSecondary}
          style={styles.codeInput}
        />
        {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
        <AppButton
          label={joining ? 'Joining...' : 'Join'}
          loading={joining}
          onPress={onJoin}
          disabled={joining}
        />
      </AppCard>

      <AppCard style={styles.activityCard}>
        <Text style={styles.section}>Recent Activity</Text>
        {loadingRecent ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING[4] }} />
        ) : recent.length === 0 ? (
          <Text style={styles.empty}>No recent activity yet. Join a session to get started!</Text>
        ) : (
          recent.map((item, index) => (
            <View key={`${item.id || index}`} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <Ionicons
                  name={
                    item.type === 'spaceRace'
                      ? 'rocket-outline'
                      : item.type === 'exitTicket'
                        ? 'document-text-outline'
                        : 'clipboard-outline'
                  }
                  size={18}
                  color={COLORS.iconMuted}
                />
              </View>
              <View style={styles.activityCopy}>
                <Text style={styles.activityTitle}>{item.title || item.type || 'Activity'}</Text>
                <Text style={styles.activityMeta}>
                  {item.score != null ? `Score ${item.score}` : String(item.type || '')}
                </Text>
              </View>
              <Text style={styles.activityDate}>
                {new Date(
                  String(item.submittedAt || item.joinedAt || item.timestamp || Date.now())
                ).toLocaleDateString()}
              </Text>
            </View>
          ))
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
  joinHint: { ...TYPE.caption, marginTop: SPACING[1], marginBottom: SPACING[4] },
  codeInput: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    minHeight: 52,
    paddingHorizontal: SPACING[4],
    marginBottom: SPACING[3],
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 4,
    textAlign: 'center',
    backgroundColor: COLORS.surfaceMuted,
  },
  error: { color: COLORS.dangerText, marginBottom: SPACING[3] },
  activityCard: { ...SHADOWS.raised },
  section: { ...TYPE.bodyStrong, fontSize: 16, marginBottom: SPACING[3] },
  empty: { ...TYPE.caption, paddingVertical: SPACING[4] },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.mutedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCopy: { flex: 1 },
  activityTitle: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium },
  activityMeta: { ...TYPE.caption, marginTop: 2 },
  activityDate: { ...TYPE.caption },
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
