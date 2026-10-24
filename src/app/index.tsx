import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { MarketingHeader } from '@/components/MarketingHeader';
import { MarketingTabBar } from '@/components/MarketingTabBar';
import { EntryGate } from '@/components/RoleRedirect';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

const HIGHLIGHTS = [
  { title: 'Real-Time Quizzes', description: 'Live questions, instant results', icon: 'flash-outline' as const },
  { title: 'AI Generation', description: 'Auto-create questions from any topic', icon: 'color-wand-outline' as const },
  { title: 'Space Race', description: 'Team-based gamified competition', icon: 'rocket-outline' as const },
  { title: 'Anonymous Feedback', description: 'Exit tickets and live chat', icon: 'chatbubbles-outline' as const },
];

const BUILT_FOR_EVERY_ROOM = [
  {
    title: 'Live Quizzes & Space Race',
    description:
      'Run real-time quizzes and competitive Space Race-style activities that energize the room.',
    icon: 'book-outline' as const,
  },
  {
    title: 'Anonymous Questions',
    description:
      'Participants can ask questions anonymously during session to participate without fear.',
    icon: 'people-outline' as const,
  },
  {
    title: 'Exit Tickets',
    description:
      'Wrap up with quick exit tickets to check understanding and guide the next lesson.',
    icon: 'ribbon-outline' as const,
  },
  {
    title: 'Participation Insights',
    description: 'See engagement at a glance to support better pacing and audience outcomes.',
    icon: 'trending-up-outline' as const,
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: 'Host Creates a Session',
    description:
      'Sign in, create a session, and share a unique 6-character code with your audience.',
    icon: 'people-outline' as const,
  },
  {
    step: 2,
    title: 'Audience Joins Instantly',
    description: 'Participants enter the code on any device. No app download, no account needed.',
    icon: 'book-outline' as const,
  },
  {
    step: 3,
    title: 'Engage and Get Insights',
    description:
      'Run quizzes, Space Race, or open anonymous chat — results appear live on your dashboard.',
    icon: 'trending-up-outline' as const,
  },
];

const WHO_USES = [
  {
    title: 'Educators',
    description:
      'University lecturers and hosts who want to measure comprehension in real time without disrupting the flow of class.',
    icon: 'school-outline' as const,
  },
  {
    title: 'Corporate Trainers',
    description:
      'Workshop facilitators and L&D teams who need live engagement data from participants during training sessions.',
    icon: 'briefcase-outline' as const,
  },
  {
    title: 'Speakers and Hosts',
    description:
      'Seminar hosts, webinar presenters, and panel moderators who want an audience that participates, not just listens.',
    icon: 'mic-outline' as const,
  },
];

export default function LandingScreen() {
  return (
    <EntryGate screen="landing">
      <View style={styles.screen}>
        <MarketingHeader active="home" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {/* Hero — same CTAs / copy as before */}
          <View style={styles.hero}>
            <Text style={styles.title}>
              Close the Gap.{'\n'}
              <Text style={styles.titleAccent}>In Real Time.</Text>
            </Text>
            <Text style={styles.subtitle}>
              Live engagement for speakers and audiences — classrooms, seminars, webinars, and
              training.
            </Text>
            <AppButton
              label="Join a Session"
              icon="enter-outline"
              onPress={() => router.push('/join')}
              style={styles.cta}
            />
            <AppButton
              label="Host Login"
              variant="secondary"
              icon="person-outline"
              onPress={() => router.push('/host-login')}
              style={styles.ctaSecondary}
            />
          </View>

          {/* What you can do */}
          <Text style={styles.section}>What you can do</Text>
          <View style={styles.grid}>
            {HIGHLIGHTS.map((item) => (
              <AppCard key={item.title} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
              </AppCard>
            ))}
          </View>

          {/* Built for Every Room */}
          <View style={styles.band}>
            <Text style={styles.sectionTitle}>Built for Every Room. Not Just Classrooms.</Text>
            <Text style={styles.sectionBody}>
              Whether you are teaching a university lecture, running a corporate workshop, or
              hosting a webinar — FeedEcho gives every participant a voice.
            </Text>
            <View style={styles.grid}>
              {BUILT_FOR_EVERY_ROOM.map((item) => (
                <AppCard key={item.title} style={styles.card}>
                  <View style={styles.cardIconLg}>
                    <Ionicons name={item.icon} size={22} color={COLORS.primary} />
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardBody}>{item.description}</Text>
                </AppCard>
              ))}
            </View>
          </View>

          {/* How It Works */}
          <Text style={styles.sectionTitle}>How It Works</Text>
          <Text style={[styles.sectionBody, styles.sectionBodyCenter]}>
            Get started in three simple steps
          </Text>
          <View style={styles.grid}>
            {HOW_IT_WORKS.map((item) => (
              <AppCard key={item.step} style={styles.card}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{item.step}</Text>
                </View>
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
              </AppCard>
            ))}
          </View>

          {/* Who Uses FeedEcho? */}
          <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Who Uses FeedEcho?</Text>
          <View style={styles.grid}>
            {WHO_USES.map((item) => (
              <AppCard key={item.title} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={item.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.cardTitleLg}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.description}</Text>
              </AppCard>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerBrand}>FeedEcho</Text>
            <Text style={styles.footerTagline}>
              Real-time engagement for every kind of session.
            </Text>
            <TouchableOpacity
              style={styles.footerMail}
              onPress={() => Linking.openURL('mailto:feedecho4@gmail.com')}
              accessibilityRole="link"
              accessibilityLabel="Email feedecho4@gmail.com">
              <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={styles.footerMailText}>feedecho4@gmail.com</Text>
            </TouchableOpacity>

            <Text style={styles.footerLinksHeading}>Quick Links</Text>
            <TouchableOpacity onPress={() => router.push('/about' as Href)}>
              <Text style={styles.footerLink}>About Us</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/contact' as Href)}>
              <Text style={styles.footerLink}>Contact</Text>
            </TouchableOpacity>

            <View style={styles.footerDivider} />
            <Text style={styles.copyright}>© 2026 FeedEcho. All rights reserved.</Text>
          </View>
        </ScrollView>
        <MarketingTabBar active="home" />
      </View>
    </EntryGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  content: {
    // Small clearance above the tab bar — tab bar is a flex sibling (not overlay).
    paddingBottom: SPACING[4],
  },
  hero: {
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[8],
    paddingBottom: SPACING[2],
    alignItems: 'stretch',
  },
  title: { ...TYPE.hero, textAlign: 'center' },
  titleAccent: { color: COLORS.primary },
  subtitle: {
    ...TYPE.subtitle,
    textAlign: 'center',
    marginTop: SPACING[4],
  },
  cta: { marginTop: SPACING[8] },
  ctaSecondary: { marginTop: SPACING[3] },
  section: {
    ...TYPE.section,
    marginTop: SPACING[8],
    marginBottom: SPACING[3],
    paddingHorizontal: SPACING[6],
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.ink,
    textAlign: 'center',
    paddingHorizontal: SPACING[6],
    marginTop: SPACING[8],
    marginBottom: SPACING[3],
    lineHeight: 28,
  },
  sectionSpaced: { marginTop: SPACING[10] },
  sectionBody: {
    ...TYPE.subtitle,
    textAlign: 'center',
    paddingHorizontal: SPACING[6],
    marginBottom: SPACING[5],
  },
  sectionBodyCenter: { marginTop: -SPACING[1] },
  band: {
    marginTop: SPACING[8],
    paddingVertical: SPACING[6],
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
  },
  grid: {
    gap: SPACING[3],
    paddingHorizontal: SPACING[6],
  },
  card: { ...SHADOWS.card },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  cardIconLg: {
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
  stepBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  stepBadgeText: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 16,
  },
  footer: {
    marginTop: SPACING[10],
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[8],
    // Tab bar sits below the ScrollView; keep modest inner padding only.
    paddingBottom: SPACING[4],
  },
  footerBrand: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING[2],
  },
  footerTagline: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: SPACING[3],
  },
  footerMail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING[6],
  },
  footerMailText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
  footerLinksHeading: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 15,
    marginBottom: SPACING[3],
  },
  footerLink: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    marginBottom: SPACING[2],
  },
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: SPACING[5],
    marginBottom: SPACING[5],
  },
  copyright: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textAlign: 'center',
  },
});
