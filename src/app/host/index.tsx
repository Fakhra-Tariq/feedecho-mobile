import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateSessionBannerButton } from '@/components/CreateSessionBannerButton';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { AppButton, AppCard, PressableCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  formatActivityLine,
  parseActivityHistory,
  type HostSession,
} from '@/lib/hostSessions';

const ACTIVITIES = [
  {
    title: 'Create Quiz',
    description: 'Design and launch a new quiz',
    href: '/host/quiz' as Href,
    icon: 'help-circle-outline' as const,
  },
  {
    title: 'Live Chat',
    description: 'Start an interactive session',
    href: '/host/live-chat' as Href,
    icon: 'chatbubbles-outline' as const,
  },
  {
    title: 'Space Race',
    description: 'Engage with gamification',
    href: '/host/space-race' as Href,
    icon: 'rocket-outline' as const,
  },
  {
    title: 'Exit Ticket',
    description: 'Gather quick feedback',
    href: '/host/exit-ticket' as Href,
    icon: 'document-text-outline' as const,
  },
];

/** Same relative buckets as Web HostDashboard `formatRelativeTime`. */
function formatRelativeTime(timestamp?: string) {
  if (!timestamp) return 'just now';
  const diff = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(diff)) return 'just now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

function activityIconName(type?: string): keyof typeof Ionicons.glyphMap {
  const kind = String(type || '')
    .toLowerCase()
    .replace(/_/g, '');
  if (kind === 'quiz') return 'help-circle-outline';
  if (kind === 'spacerace') return 'rocket-outline';
  if (kind === 'exitticket') return 'document-text-outline';
  if (kind === 'livechat' || kind === 'anonymouschat') return 'chatbubbles-outline';
  if (kind === 'session') return 'calendar-outline';
  return 'pulse-outline';
}

type RecentItem = {
  id: string;
  type?: string;
  title: string;
  subtitle?: string;
  timestamp: string;
};

/**
 * Read-only feed from existing session `activityHistory` (already loaded via
 * HostSessionContext / RTDB `sessions`). Web Explore uses localStorage
 * `activityLog` instead — Mobile has no equivalent store.
 */
function buildRecentActivity(sessions: HostSession[]): RecentItem[] {
  const items: RecentItem[] = [];
  sessions.forEach((session) => {
    const sessionLabel = String(session.sessionName || '').trim();
    parseActivityHistory(session).forEach((entry, index) => {
      const timestamp = String(entry.launchedAt || '').trim();
      if (!timestamp) return;
      items.push({
        id: String(entry.id || `${session.id}-${timestamp}-${entry.type || index}`),
        type: entry.type,
        title: formatActivityLine(entry),
        // Only show a real session name — never interpolate undefined (Web bug:
        // `Anonymous chat ${status}` when status is missing).
        subtitle: sessionLabel || undefined,
        timestamp,
      });
    });
  });
  return items
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 6);
}

export default function ExploreScreen() {
  const { activeSession, sessions, loading: sessionsLoading, createSession, endSession } =
    useHostSessions();
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const recentActivity = useMemo(() => buildRecentActivity(sessions), [sessions]);

  const onCreatePress = () => {
    setShowCreate(true);
  };

  const onCreateSubmit = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const session = await createSession(sessionName);
      setShowCreate(false);
      setSessionName('');
      setCreatedName(session.sessionName);
      setCreatedCode(session.sessionCode);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not create session',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setCreating(false);
    }
  };

  const onCopy = async (code: string, options?: { brief?: boolean }) => {
    try {
      await Clipboard.setStringAsync(code);
      if (options?.brief) {
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 1600);
        return;
      }
      showToast({ type: 'success', title: 'Copied', message: 'Code copied to clipboard' });
    } catch {
      showAlert({
        type: 'error',
        title: 'Copy failed',
        message: 'Copy the code manually.',
        primary: { label: 'Close' },
      });
    }
  };

  const onEndConfirm = async () => {
    if (!activeSession || ending) return;
    setEnding(true);
    try {
      await endSession(activeSession);
      setShowEndConfirm(false);
      showToast({ type: 'success', title: 'Ended', message: 'Session ended' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not end session',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setEnding(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Welcome back</Text>
        <Text style={styles.bannerSubtitle}>
          {"Monitor your classroom's progress and engage with the audience through interactive activities."}
        </Text>
        <CreateSessionBannerButton
          hasActiveSession={Boolean(activeSession)}
          onCreate={onCreatePress}
        />
      </View>

      {activeSession ? (
        <View style={styles.sessionCard}>
          <View style={styles.sessionRow1}>
            <View style={styles.sessionIcon}>
              <Ionicons name="pulse-outline" size={20} color={COLORS.plum} />
            </View>
            <Text style={styles.sessionName} numberOfLines={1}>
              {activeSession.sessionName || 'Session'}
            </Text>
          </View>

          <View style={styles.sessionRow2}>
            <View style={styles.codeGroup}>
              <Text style={styles.codeLabel}>Code:</Text>
              <Text style={styles.codeValue}>{activeSession.sessionCode}</Text>
              <Pressable
                onPress={() => onCopy(activeSession.sessionCode, { brief: true })}
                style={styles.copyBtn}
                accessibilityRole="button"
                accessibilityLabel="Copy code"
                hitSlop={4}>
                <Ionicons
                  name={codeCopied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color="#6B3A5C"
                />
              </Pressable>
              {codeCopied ? <Text style={styles.copiedHint}>Copied</Text> : null}
            </View>

            <Pressable
              style={({ pressed }) => [styles.endSessionBtn, pressed && styles.endSessionBtnPressed]}
              onPress={() => setShowEndConfirm(true)}
              accessibilityRole="button"
              accessibilityLabel="End session">
              <Ionicons name="close" size={16} color={COLORS.white} />
              <Text style={styles.endSessionLabel}>End Session</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Activities</Text>
      <View style={styles.grid}>
        {ACTIVITIES.map((activity) => (
          <PressableCard
            key={activity.title}
            style={styles.activityCard}
            onPress={() => router.push(activity.href)}>
            <View style={styles.activityIcon}>
              <Ionicons name={activity.icon} size={22} color={COLORS.white} />
            </View>
            <Text style={styles.activityTitle}>{activity.title}</Text>
            <Text style={styles.activityBody}>{activity.description}</Text>
          </PressableCard>
        ))}
      </View>

      {/* Recent Activity — layout matches Web HostDashboard mobile card */}
      <View style={styles.recentCard}>
        <View style={styles.recentHeader}>
          <View style={styles.recentHeaderCopy}>
            <Text style={styles.recentTitle}>Recent Activity</Text>
            <Text style={styles.recentSubtitle}>Latest actions and updates in your classroom</Text>
          </View>
          <View
            style={styles.recentHeaderIcon}
            accessibilityRole="image"
            accessibilityLabel="Recent activity">
            <Ionicons name="pulse-outline" size={18} color={COLORS.white} />
          </View>
        </View>

        {sessionsLoading ? (
          <ActivityIndicator color={COLORS.plum} style={styles.recentLoading} />
        ) : recentActivity.length === 0 ? (
          <Text style={styles.recentEmpty}>No recent activity yet.</Text>
        ) : (
          <View style={styles.recentList}>
            {recentActivity.map((item) => (
              <View key={item.id} style={styles.recentRow}>
                <Ionicons name={activityIconName(item.type)} size={18} color={COLORS.plum} />
                <View style={styles.recentRowCopy}>
                  <Text style={styles.recentRowTitle}>{item.title}</Text>
                  {item.subtitle ? (
                    <Text style={styles.recentRowSubtitle}>{item.subtitle}</Text>
                  ) : null}
                  <Text style={styles.recentRowTime}>{formatRelativeTime(item.timestamp)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <CreateSessionModal
        visible={showCreate}
        title="Create Session"
        value={sessionName}
        onChangeText={setSessionName}
        onCancel={() => {
          setShowCreate(false);
          setSessionName('');
        }}
        onSubmit={onCreateSubmit}
        submitting={creating}
      />

      <ConfirmModal
        visible={showEndConfirm}
        title="End Session?"
        message="Are you sure you want to end this session? This action cannot be undone."
        confirmLabel="End Session"
        destructive
        busy={ending}
        onCancel={() => setShowEndConfirm(false)}
        onConfirm={onEndConfirm}
      />

      <Modal visible={Boolean(createdCode)} transparent animationType="fade">
        <View style={styles.overlay}>
          <AppCard style={styles.createdCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={36} color={COLORS.success} />
            </View>
            <Text style={styles.createdTitle}>Session Created!</Text>
            <Text style={styles.createdBody}>Session: {createdName}</Text>
            <View style={styles.codeBox}>
              <Text style={styles.codeCaption}>Session Code</Text>
              <Text style={styles.codeHuge}>{createdCode}</Text>
            </View>
            <View style={styles.row}>
              <AppButton
                label="Copy Code"
                icon="copy-outline"
                onPress={() => createdCode && onCopy(createdCode)}
                style={styles.flex}
              />
              <AppButton
                label="Done"
                variant="secondary"
                onPress={() => setCreatedCode(null)}
                style={styles.flex}
              />
            </View>
          </AppCard>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: SPACING[4],
    gap: SPACING[4],
    // Tab bar is in normal layout (not overlapping) — only a small end margin.
    paddingBottom: SPACING[5],
  },
  banner: {
    // Solid plum — expo-linear-gradient is not installed (Web uses
    // from-[#6D415F] via-[#6D415F]/90 to-[#3A2E2A]).
    backgroundColor: '#6B3A5C',
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    marginHorizontal: 0,
  },
  bannerTitle: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: FONT_WEIGHTS.bold,
  },
  bannerSubtitle: {
    marginTop: 8,
    color: '#EADBE5',
    lineHeight: 20,
    fontSize: 14,
  },
  sessionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 14,
    marginHorizontal: 0,
  },
  sessionRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1E4EC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sessionName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  sessionRow2: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flexShrink: 1,
  },
  codeLabel: {
    fontSize: 13,
    color: '#5F5460',
    flexShrink: 0,
  },
  codeValue: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#6B3A5C',
    letterSpacing: 1,
    flexShrink: 1,
  },
  copyBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copiedHint: {
    fontSize: 12,
    color: '#6B3A5C',
    fontWeight: FONT_WEIGHTS.medium,
    flexShrink: 0,
  },
  endSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  endSessionBtnPressed: {
    backgroundColor: '#DC2626',
  },
  endSessionLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  section: { ...TYPE.section },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[3],
  },
  activityCard: {
    width: '47%',
    flexGrow: 1,
    minHeight: 140,
    backgroundColor: COLORS.blush,
    borderColor: COLORS.divider,
  },
  activityIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  activityTitle: { ...TYPE.bodyStrong, fontSize: 16, marginBottom: SPACING[1] },
  activityBody: { ...TYPE.caption },
  recentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 14,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  recentHeaderCopy: { flex: 1, minWidth: 0 },
  recentTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  recentSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F5460',
  },
  recentHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6B3A5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentLoading: { marginTop: 12 },
  recentEmpty: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 13,
    color: '#5F5460',
    paddingVertical: SPACING[4],
  },
  recentList: {
    marginTop: 12,
    gap: 10,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#ECE3EA',
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.white,
  },
  recentRowCopy: { flex: 1, minWidth: 0 },
  recentRowTitle: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  recentRowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F5460',
  },
  recentRowTime: {
    marginTop: 4,
    fontSize: 11,
    color: '#8A7F89',
  },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING[6],
  },
  createdCard: { ...SHADOWS.raised },
  successIcon: { alignSelf: 'center', marginBottom: SPACING[2] },
  createdTitle: { ...TYPE.title, textAlign: 'center', fontSize: 22 },
  createdBody: { ...TYPE.caption, textAlign: 'center', marginTop: SPACING[1] },
  codeBox: {
    marginTop: SPACING[4],
    marginBottom: SPACING[4],
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[5],
    alignItems: 'center',
  },
  codeCaption: { ...TYPE.caption },
  codeHuge: {
    marginTop: SPACING[2],
    fontSize: 34,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    letterSpacing: 3,
  },
  row: { flexDirection: 'row', gap: SPACING[3] },
  flex: { flex: 1 },
});
