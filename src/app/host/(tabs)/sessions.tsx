import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ConfirmModal';
import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  CreateSessionBannerButton,
  showActiveSessionCreateToast,
} from '@/components/CreateSessionBannerButton';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { AppButton, EmptyState } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  formatActivityLine,
  isSessionActive,
  parseActivityHistory,
  type HostSession,
} from '@/lib/hostSessions';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

const PAGE_SIZE = 5;

/** Match Web Sessions date look, e.g. "Sep 22, 2026, 6:02 AM". */
function formatSessionDateTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const { sessions, activeSession, loading, createSession, endSession, deleteSession } =
    useHostSessions();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showCreate, setShowCreate] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [endTarget, setEndTarget] = useState<HostSession | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HostSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visibleSessions = useMemo(
    () => sessions.slice(0, visibleCount),
    [sessions, visibleCount]
  );

  const onCreatePress = () => {
    if (activeSession) {
      showActiveSessionCreateToast();
      return;
    }
    setShowCreate(true);
  };

  const onCreateSubmit = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createSession(sessionName);
      setShowCreate(false);
      setSessionName('');
      showToast({
        type: 'success',
        title: 'Session created',
        message: `Code ${created.sessionCode}`,
      });
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

  const onCopy = async (sessionId: string, code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId((id) => (id === sessionId ? null : id)), 1600);
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
    if (!endTarget) return;
    setBusy(true);
    try {
      await endSession(endTarget);
      setEndTarget(null);
      showToast({ type: 'success', title: 'Ended', message: 'Session ended' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not end session',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteSession(deleteTarget);
      setDeleteTarget(null);
      showToast({ type: 'success', title: 'Removed', message: 'Session deleted' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not delete session',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.title}>Sessions</Text>
        <Text style={styles.subtitle}>
          View all your classroom sessions and the activities launched within each one.
        </Text>
        <CreateSessionBannerButton
          hasActiveSession={Boolean(activeSession)}
          onCreate={() => setShowCreate(true)}
        />
      </View>

      {sessions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No sessions yet"
          message="Create your first session to start launching activities with a shared join code."
          actionLabel="Create Session"
          onAction={onCreatePress}
        />
      ) : (
        <FlatList
          data={visibleSessions}
          extraData={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4] },
          ]}
          renderItem={({ item }) => {
            const active = isSessionActive(item);
            const activities = parseActivityHistory(item);
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.sessionName || 'Untitled Session'}
                    </Text>
                    <View style={[styles.badge, active ? styles.badgeActive : styles.badgeEnded]}>
                      <Text style={[styles.badgeText, active ? styles.badgeActiveText : null]}>
                        {active ? 'ACTIVE' : 'ENDED'}
                      </Text>
                    </View>
                  </View>
                  {!active ? (
                    <Pressable
                      onPress={() => setDeleteTarget(item)}
                      style={({ pressed }) => [
                        styles.trashBtn,
                        pressed && styles.trashBtnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Delete session"
                      hitSlop={4}>
                      {({ pressed }) => (
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={pressed ? '#B3261E' : '#6B6470'}
                        />
                      )}
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.infoBlock}>
                  {active ? (
                    <View style={styles.codeRow}>
                      <View style={styles.codeBlock}>
                        {item.sessionCode ? (
                          <>
                            <Text style={styles.hashPrefix}>#</Text>
                            <Text style={styles.code} numberOfLines={1}>
                              {item.sessionCode}
                            </Text>
                            <Pressable
                              onPress={() => onCopy(item.id, item.sessionCode)}
                              style={styles.copyBtn}
                              accessibilityRole="button"
                              accessibilityLabel="Copy code"
                              hitSlop={4}>
                              <Ionicons
                                name={copiedId === item.id ? 'checkmark' : 'copy-outline'}
                                size={18}
                                color="#6B3A5C"
                              />
                            </Pressable>
                            {copiedId === item.id ? (
                              <Text style={styles.copiedHint} numberOfLines={1}>
                                Copied
                              </Text>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => setEndTarget(item)}
                        style={({ pressed }) => [
                          styles.endButton,
                          pressed && styles.endButtonPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="End session">
                        <Ionicons name="close" size={16} color={COLORS.white} />
                        <Text style={styles.endButtonLabel} numberOfLines={1}>
                          End Session
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={16} color="#5F5460" />
                    <Text style={styles.infoText}>{formatSessionDateTime(item.createdAt)}</Text>
                  </View>

                  {active ? (
                    <View style={styles.infoRow}>
                      <Ionicons name="people-outline" size={16} color="#5F5460" />
                      <Text style={styles.infoText}>
                        Participants: {Number(item.participants || 0)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.activities}>
                  <Text style={styles.activitiesTitle}>ACTIVITIES IN THIS SESSION</Text>
                  {activities.length === 0 ? (
                    <Text style={styles.activitiesEmpty}>
                      No activities launched in this session yet.
                    </Text>
                  ) : (
                    activities.map((entry, index) => (
                      <Text
                        key={entry.id || `${entry.type}-${entry.launchedAt}-${index}`}
                        style={styles.activityLine}>
                        {formatActivityLine(entry)}
                      </Text>
                    ))
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            sessions.length > visibleCount ? (
              <AppButton
                label="Show more"
                variant="secondary"
                onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
                style={styles.showMore}
                fullWidth={false}
              />
            ) : null
          }
        />
      )}

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
        visible={Boolean(endTarget)}
        title="End Session?"
        message="Are you sure you want to end this session? This action cannot be undone."
        confirmLabel="End Session"
        destructive
        busy={busy}
        onCancel={() => setEndTarget(null)}
        onConfirm={onEndConfirm}
      />

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="Delete session?"
        message="Are you sure you want to delete this session?"
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDeleteConfirm}
      />
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
  },
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
    backgroundColor: '#6B3A5C',
    gap: SPACING[3],
  },
  title: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    color: '#EADBE5',
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    paddingTop: 16,
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 16,
    marginHorizontal: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  badgeActive: { backgroundColor: '#DCFCE7' },
  badgeEnded: { backgroundColor: '#F1EDF0' },
  badgeText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#5F5460',
    textTransform: 'uppercase',
  },
  badgeActiveText: { color: '#15803D' },
  trashBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trashBtnPressed: {
    backgroundColor: '#FBEAE8',
  },
  infoBlock: {
    marginTop: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  codeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  hashPrefix: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#6B3A5C',
    flexShrink: 0,
  },
  code: {
    fontSize: 15,
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
  },
  infoText: {
    fontSize: 13,
    color: '#5F5460',
  },
  endButton: {
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
  endButtonPressed: {
    backgroundColor: '#DC2626',
  },
  endButtonLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  activities: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFE7EC',
  },
  activitiesTitle: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1,
    color: '#6B3A5C',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  activitiesEmpty: {
    fontSize: 13,
    color: '#5F5460',
    fontStyle: 'italic',
  },
  activityLine: {
    fontSize: 13,
    color: '#2B1F27',
    marginBottom: 8,
  },
  showMore: {
    alignSelf: 'center',
    marginVertical: SPACING[4],
  },
});
