import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { MarketingHeader } from '@/components/MarketingHeader';
import { MarketingTabBar } from '@/components/MarketingTabBar';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

const ENGAGEMENT_CARDS = [
  {
    title: 'Anonymous Questions',
    description:
      'Participants can ask questions anonymously during session, helping shy or introverted learners participate confidently.',
    icon: 'chatbubbles-outline' as const,
  },
  {
    title: 'Exit Tickets',
    description:
      'Collect quick reflections at the end of session to check understanding and plan the next lesson with clarity.',
    icon: 'clipboard-outline' as const,
  },
  {
    title: 'Live Quizzes',
    description:
      'Run real-time quizzes to measure comprehension instantly and keep momentum high throughout the lesson.',
    icon: 'flash-outline' as const,
  },
  {
    title: 'Space Race Engagement',
    description: 'Turn practice into a fun competition with improve focus and participation.',
    icon: 'trophy-outline' as const,
  },
];

const PRINCIPLES = [
  {
    title: 'Safe by Design',
    description:
      'Every interaction is designed to reduce pressure. Anonymous features mean honest responses — especially for audiences who hesitate to speak up in group settings.',
    icon: 'shield-checkmark-outline' as const,
  },
  {
    title: 'Speaker-Audience Productivity',
    description:
      'Less guesswork for the speaker, more clarity for the audience. FeedEcho turns one-way sessions into live two-way conversations.',
    icon: 'people-outline' as const,
  },
];

export default function AboutScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const engagementY = useRef(0);

  const scrollToEngagement = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, engagementY.current - 12),
      animated: true,
    });
  };

  return (
    <View style={styles.screen}>
      <MarketingHeader active="about" />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>
            About <Text style={styles.titleAccent}>FeedEcho</Text>
          </Text>
          <Text style={styles.body}>
            FeedEcho was built around one observation — the gap between what a speaker intends and
            what an audience understands is invisible in real time. We built a platform to close
            that gap, live, during the session, not after. Hosts get a clear signal of who is
            following along, and participants get simple ways to speak up without interrupting the
            flow. The goal is the same in every room: fewer assumptions, more shared understanding,
            while the conversation is still happening.
          </Text>
          <AppButton
            label="See How It Works"
            variant="secondary"
            onPress={scrollToEngagement}
            style={styles.cta}
          />
        </View>

        <View
          onLayout={(event) => {
            engagementY.current = event.nativeEvent.layout.y;
          }}
          style={styles.band}>
          <Text style={styles.sectionTitle}>Built for Engagement</Text>
          <Text style={styles.sectionBody}>
            Every feature is designed around one goal — making sure no participant is left behind,
            whether they are in a lecture hall, a Zoom call, or a boardroom.
          </Text>
          <View style={styles.grid}>
            {ENGAGEMENT_CARDS.map((item) => (
              <AppCard key={item.title} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={22} color={COLORS.primary} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
              </AppCard>
            ))}
          </View>
        </View>

        <View style={styles.principles}>
          <View style={styles.grid}>
            {PRINCIPLES.map((item) => (
              <AppCard key={item.title} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.cardTitleLg}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
              </AppCard>
            ))}
          </View>
        </View>
      </ScrollView>
      <MarketingTabBar active="about" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: { paddingBottom: SPACING[6] },
  hero: {
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[8],
    paddingBottom: SPACING[6],
  },
  title: {
    ...TYPE.hero,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: SPACING[4],
  },
  titleAccent: { color: COLORS.primary },
  body: {
    ...TYPE.subtitle,
    textAlign: 'center',
    color: COLORS.ink,
    lineHeight: 24,
  },
  cta: { marginTop: SPACING[6] },
  band: {
    paddingVertical: SPACING[6],
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.ink,
    textAlign: 'center',
    paddingHorizontal: SPACING[6],
    marginBottom: SPACING[3],
  },
  sectionBody: {
    ...TYPE.subtitle,
    textAlign: 'center',
    paddingHorizontal: SPACING[6],
    marginBottom: SPACING[5],
  },
  principles: {
    paddingTop: SPACING[8],
    paddingBottom: SPACING[4],
  },
  grid: {
    gap: SPACING[3],
    paddingHorizontal: SPACING[6],
  },
  card: { ...SHADOWS.card },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  cardTitle: { ...TYPE.bodyStrong },
  cardTitleLg: { ...TYPE.bodyStrong, fontSize: 18 },
  cardBody: { ...TYPE.caption, marginTop: SPACING[1] },
});
