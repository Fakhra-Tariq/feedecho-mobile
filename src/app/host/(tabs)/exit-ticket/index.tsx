import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { HostNoSessionBanner } from '@/components/HostNoSessionBanner';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showAlert, showToast } from '@/components/feedback';
import { HeroHowItWorksLink, HeroStatTiles } from '@/components/HostHeroChrome';
import { HostFilterChips, HostSearchBar } from '@/components/HostListToolbar';
import { EmptyState } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions, useSessionActivityLabel } from '@/context/HostSessionContext';
import {
  blockMobileLaunchIfBusy,
  cleanErrorMessage,
  showLaunchFailureAlert,
} from '@/lib/activeActivity';
import { ANOTHER_ACTIVITY_LIVE_HINT, liveActivityBlocksLaunch } from '@/lib/liveHostActivity';
import {
  archiveExitTicket,
  attachQuestionsToTickets,
  deleteExitTicket,
  displayTicketStatus,
  endExitTicket,
  getExitTicketById,
  startExitTicket,
  ticketQuestionCount,
  type ExitTicket,
} from '@/lib/hostExitTickets';
import {
  isClaimedCurrentActivity,
  isLinkedSessionInactive,
  type SessionMatchInput,
} from '@/lib/sessionActivityMatch';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { useRtdbValue } from '@/lib/useRtdb';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'ended', label: 'Ended' },
] as const;

function ticketListStatus(
  ticket: ExitTicket,
  sessions: Array<{ id?: string; sessionCode?: string; status?: string }>,
  session?: SessionMatchInput | null
) {
  if (isClaimedCurrentActivity('exitticket', ticket.id, session)) return 'active';
  const status = displayTicketStatus(ticket.status);
  if (status === 'active' && isLinkedSessionInactive(ticket as Record<string, unknown>, sessions)) {
    return 'ended';
  }
  return status;
}

/** Display-only: Active tickets first, then the existing recency order (stable). */
function sortTicketsForDisplay(
  tickets: ExitTicket[],
  sessions: Array<{ id?: string; sessionCode?: string; status?: string }>,
  session?: SessionMatchInput | null
) {
  const active: ExitTicket[] = [];
  const rest: ExitTicket[] = [];
  for (const ticket of tickets) {
    if (ticketListStatus(ticket, sessions, session) === 'active') active.push(ticket);
    else rest.push(ticket);
  }
  return [...active, ...rest];
}

const HOW_IT_WORKS_STEPS = [
  'Create your exit ticket questions',
  'Choose Save as Draft or Launch',
  'Launching requires an active session',
  'Responses are collected anonymously, but attendance is tracked separately.',
] as const;

export default function ExitTicketLibraryScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const {
    activeSession,
    createSession,
    liveActivity,
    sessions,
    dataEpoch,
    liveTickets,
    liveTicketsLoading,
    liveTicketsError,
  } = useHostSessions();
  const activityStatus = useSessionActivityLabel();
  const uid = String(user?.uid || profile?.uid || '').trim();

  const { value: questionsTree } = useRtdbValue(uid ? 'exit_questions' : null, {
    enabled: Boolean(uid),
    resyncKey: dataEpoch,
  });

  const [tickets, setTickets] = useState<ExitTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExitTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchedCode, setLaunchedCode] = useState('');
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [createdSessionCode, setCreatedSessionCode] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ExitTicket>>(null);
  const prevActiveTicketId = useRef<string | null>(null);
  const pendingTicketDeletes = useRef(new Set<string>());
  const pendingTicketEnds = useRef(new Set<string>());
  const questionDetailRequested = useRef(new Set<string>());

  const applyTicketRows = useCallback(
    (rows: ExitTicket[]) => {
      const sorted = rows.slice().sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
      );
      pendingTicketDeletes.current.forEach((id) => {
        if (!sorted.some((t) => t.id === id)) pendingTicketDeletes.current.delete(id);
      });
      pendingTicketEnds.current.forEach((id) => {
        const live = sorted.find((t) => t.id === id);
        const status = live ? displayTicketStatus(live.status) : '';
        if (!live || status === 'ended' || status === 'paused') {
          pendingTicketEnds.current.delete(id);
        }
      });
      setTickets((prev) => {
        const prevById = Object.fromEntries(prev.map((t) => [t.id, t]));
        return attachQuestionsToTickets(
          sorted.filter((t) => !pendingTicketDeletes.current.has(t.id)),
          questionsTree,
          prevById
        ).map((t) => (pendingTicketEnds.current.has(t.id) ? { ...t, status: 'ended' } : t));
      });
      setLoading(false);
    },
    [questionsTree]
  );

  useEffect(() => {
    if (!uid) {
      setTickets([]);
      setLoading(false);
      return undefined;
    }
    if (liveTicketsLoading && (liveTickets as ExitTicket[]).length === 0) {
      return undefined;
    }
    applyTicketRows(liveTickets as ExitTicket[]);
    return undefined;
  }, [uid, liveTickets, liveTicketsLoading, liveTicketsError, applyTicketRows]);

  // Web ExitTicketDashboard: GET /exit-tickets/:id when exit_questions has no row yet.
  useEffect(() => {
    const missing = tickets.filter(
      (t) => t.id && !t.questions?.length && !questionDetailRequested.current.has(t.id)
    );
    if (!missing.length) return undefined;
    let cancelled = false;
    missing.forEach((t) => questionDetailRequested.current.add(t.id));
    Promise.all(
      missing.map((t) =>
        getExitTicketById(t.id)
          .then((full) => full)
          .catch(() => null)
      )
    ).then((rows) => {
      if (cancelled) return;
      setTickets((prev) =>
        prev.map((p) => {
          const full = rows.find((row) => row?.id === p.id);
          if (!full?.questions?.length) return p;
          return {
            ...p,
            questions: full.questions,
            responsesCount: full.responsesCount ?? p.responsesCount,
          };
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [tickets]);

  const stats = useMemo(() => {
    const drafts = tickets.filter((t) => ticketListStatus(t, sessions, activeSession) === 'draft').length;
    const active = tickets.filter((t) => ticketListStatus(t, sessions, activeSession) === 'active').length;
    const ended = tickets.filter((t) => {
      const s = ticketListStatus(t, sessions, activeSession);
      return s === 'ended' || s === 'paused';
    }).length;
    return { drafts, active, ended };
  }, [tickets, sessions, activeSession]);

  const activeTicket = tickets.find((t) => ticketListStatus(t, sessions, activeSession) === 'active');

  const filtered = useMemo(() => {
    let rows = tickets;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((t) => String(t.title || '').toLowerCase().includes(term));
    }
    if (filter !== 'all') {
      rows = rows.filter((t) => ticketListStatus(t, sessions, activeSession) === filter);
    }
    return sortTicketsForDisplay(rows, sessions, activeSession);
  }, [tickets, search, filter, sessions, activeSession]);

  useEffect(() => {
    const id = activeTicket?.id || null;
    if (id && id !== prevActiveTicketId.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    prevActiveTicketId.current = id;
  }, [activeTicket?.id]);

  const sessionCode = activeSession?.sessionCode || '—';
  const listPadBottom = TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4];

  const copyCode = async (code: string, ticketId: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedId(ticketId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const requireSession = () => {
    if (activeSession?.sessionCode) return true;
    showAlert({
      type: 'warning',
      title: 'No active session',
      message: 'Only one session can be active at a time. Create a session on Explore first.',
      primary: { label: 'Close' },
    });
    return false;
  };

  const ticketLaunchBlocked = liveActivityBlocksLaunch(liveActivity);

  const onLaunch = async (ticket: ExitTicket) => {
    if (!requireSession()) return;
    if (blockMobileLaunchIfBusy(liveActivity, { type: 'exitticket', id: ticket.id })) return;
    if (launchingId) return;
    setLaunchingId(ticket.id);
    try {
      const launched = await startExitTicket(ticket.id);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, ...launched } : t))
      );
      setLaunchedCode(launched.joinCode || '');
    } catch (error) {
      showLaunchFailureAlert(activeSession?.currentActivity, error);
    } finally {
      setLaunchingId(null);
    }
  };

  const onEnd = async (ticketId: string) => {
    try {
      const ended = await endExitTicket(ticketId);
      pendingTicketEnds.current.add(ticketId);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, ...ended } : t)));
      showToast({ type: 'success', title: 'Ended', message: 'Exit ticket ended' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'End failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    }
  };

  // Kept for parity with Web / future wiring — Archive UI removed from cards.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onArchive = async (ticket: ExitTicket) => {
    try {
      const archived = await archiveExitTicket(ticket.id);
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, ...archived } : t)));
      showToast({ type: 'success', title: 'Archived', message: 'Exit ticket archived' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Archive failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteExitTicket(deleteTarget.id);
      pendingTicketDeletes.current.add(deleteTarget.id);
      setTickets((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast({ type: 'success', title: 'Removed', message: 'Exit ticket deleted' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Delete failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  const onCreateSession = useCallback(async () => {
    if (!sessionName.trim()) {
      showAlert({
        type: 'warning',
        title: 'Session name required',
        message: 'Enter a session name.',
        primary: { label: 'Close' },
      });
      return;
    }
    setCreatingSession(true);
    try {
      const session = await createSession(sessionName.trim());
      setShowCreateSession(false);
      setSessionName('');
      setCreatedSessionCode(session.sessionCode);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not create session',
        message: cleanErrorMessage(error, 'Failed to create session'),
        primary: { label: 'Close' },
      });
    } finally {
      setCreatingSession(false);
    }
  }, [createSession, sessionName]);

  const listHeader = (
    <View style={styles.listHeader}>
      {activeSession ? (
        <View style={styles.sessionBanner} accessibilityRole="text">
          <Ionicons name="checkmark-circle" size={16} color="#4A1F3D" />
          <Text style={styles.sessionBannerText}>
            {'Launching to session: '}
            <Text style={styles.sessionBannerCode}>{sessionCode}</Text>
            {` · ${activityStatus}`}
          </Text>
        </View>
      ) : (
        <HostNoSessionBanner
          style={styles.sessionIdleBanner}
          onCreateSession={() => setShowCreateSession(true)}
        />
      )}

      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Exit Ticket</Text>
          <HeroHowItWorksLink onPress={() => setShowHowItWorks(true)} />
        </View>
        <Text style={styles.heroSubtitle}>
          Collect anonymous audience feedback and track attendance
        </Text>

        <HeroStatTiles
          items={[
            { label: 'Drafts', value: stats.drafts },
            { label: 'Active', value: stats.active },
            { label: 'Ended', value: stats.ended },
          ]}
        />

        <View style={styles.heroActions}>
          <Pressable
            onPress={() => router.push('/host/exit-ticket/create' as Href)}
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Create exit ticket">
            <Ionicons name="add" size={16} color="#6B3A5C" />
            <Text
              style={styles.createBtnLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}>
              Create Exit Ticket
            </Text>
          </Pressable>

          {activeTicket ? (
            <Pressable
              onPress={() => onEnd(activeTicket.id)}
              style={({ pressed }) => [styles.endHeaderBtn, pressed && styles.endHeaderBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="End exit ticket">
              <Ionicons name="square-outline" size={16} color={COLORS.white} />
              <Text
                style={styles.endHeaderLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}>
                End Exit Ticket
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <HostFilterChips
        items={FILTERS}
        value={filter}
        onChange={setFilter}
        accessibilityLabelFor={(item) => `Filter: ${item.label}`}
        style={styles.filters}
      />

      <HostSearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search exit tickets..."
        accessibilityLabel="Search exit tickets"
        style={styles.searchWrap}
      />
    </View>
  );

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          extraData={`${activeTicket?.id || ''}:${copiedId || ''}`}
          keyExtractor={(item) => item.id}
          {...KEYBOARD_SCROLL_PROPS}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title={tickets.length === 0 ? 'No exit tickets yet' : 'No matches'}
              message={
                tickets.length === 0
                  ? 'Create an exit ticket to collect quick end-of-class feedback.'
                  : 'No exit tickets match these filters yet.'
              }
              actionLabel={tickets.length === 0 ? 'Create Exit Ticket' : undefined}
              onAction={
                tickets.length === 0
                  ? () => router.push('/host/exit-ticket/create' as Href)
                  : undefined
              }
            />
          }
          renderItem={({ item }) => {
            const status = ticketListStatus(item, sessions, activeSession);
            const qCount = ticketQuestionCount(item);
            const responses = Number(item.responsesCount || 0);
            const joinCode = status === 'active' ? item.joinCode : '';
            return (
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title || 'Untitled Exit Ticket'}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        status === 'active' ? styles.badgeActive : styles.badgeEnded,
                      ]}>
                      <Text
                        style={[
                          styles.badgeText,
                          status === 'active' ? styles.badgeActiveText : styles.badgeEndedText,
                        ]}>
                        {String(status || 'draft').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  {joinCode ? (
                    <View style={styles.cardCodeGroup}>
                      <Text style={styles.codeMono} numberOfLines={1}>
                        {joinCode}
                      </Text>
                      <Pressable
                        onPress={() => copyCode(joinCode, item.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Copy code"
                        style={styles.copyIcon}>
                        <Ionicons
                          name={copiedId === item.id ? 'checkmark' : 'copy-outline'}
                          size={18}
                          color={copiedId === item.id ? COLORS.success : COLORS.inkSecondary}
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="document-text-outline" size={16} color="#5F5460" />
                    <Text style={styles.metaText}>
                      {qCount == null ? '…' : qCount} questions
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="people-outline" size={16} color="#5F5460" />
                    <Text style={styles.metaText}>{responses} responses</Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  {status === 'draft' ? (
                    <>
                      <CardButton
                        label="Edit"
                        icon="create-outline"
                        onPress={() =>
                          router.push(`/host/exit-ticket/create?edit=${item.id}` as Href)
                        }
                        accessibilityLabel="Edit exit ticket"
                      />
                      <CardButton
                        label="Launch"
                        icon="play-outline"
                        primary
                        disabled={ticketLaunchBlocked || launchingId === item.id}
                        onPress={() => onLaunch(item)}
                        accessibilityLabel={
                          ticketLaunchBlocked
                            ? 'Launch exit ticket, another activity is live'
                            : 'Launch exit ticket'
                        }
                      />
                      <CardButton
                        label="Delete"
                        icon="trash-outline"
                        danger
                        onPress={() => setDeleteTarget(item)}
                        accessibilityLabel="Delete exit ticket"
                      />
                    </>
                  ) : null}
                  {status === 'active' || status === 'paused' ? (
                    <>
                      <CardButton
                        label="End"
                        icon="stop"
                        solidEnd
                        onPress={() => onEnd(item.id)}
                        accessibilityLabel="End exit ticket"
                      />
                      <CardButton
                        label="View Responses"
                        icon="eye-outline"
                        onPress={() =>
                          router.push(`/host/exit-ticket/${item.id}/responses` as Href)
                        }
                        accessibilityLabel="View responses"
                      />
                    </>
                  ) : null}
                  {status === 'draft' && ticketLaunchBlocked ? (
                    <Text style={styles.sessionHint}>{ANOTHER_ACTIVITY_LIVE_HINT}</Text>
                  ) : null}
                  {status === 'ended' ? (
                    <>
                      <CardButton
                        label="View Responses"
                        icon="eye-outline"
                        onPress={() =>
                          router.push(`/host/exit-ticket/${item.id}/responses` as Href)
                        }
                        accessibilityLabel="View responses"
                      />
                      <CardButton
                        label="Delete"
                        icon="trash-outline"
                        danger
                        onPress={() => setDeleteTarget(item)}
                        accessibilityLabel="Delete exit ticket"
                      />
                    </>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={showHowItWorks}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHowItWorks(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="help-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.modalTitle}>How this works</Text>
              </View>
              <Pressable
                onPress={() => setShowHowItWorks(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={COLORS.iconMuted} />
              </Pressable>
            </View>
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <Text key={step} style={styles.stepLine}>
                {index + 1}. {step}
              </Text>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="Delete exit ticket?"
        message="This permanently removes the ticket, questions, and responses."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />

      <CreateSessionModal
        visible={showCreateSession}
        title="Create Session"
        value={sessionName}
        onChangeText={setSessionName}
        onCancel={() => {
          setShowCreateSession(false);
          setSessionName('');
        }}
        onSubmit={onCreateSession}
        submitting={creatingSession}
      />

      <ActivityCreatedModal
        visible={Boolean(createdSessionCode)}
        title="Session Created!"
        code={createdSessionCode}
        onClose={() => setCreatedSessionCode('')}
      />

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Exit Ticket Created"
        code={launchedCode}
        onClose={() => setLaunchedCode('')}
      />
    </KeyboardSafeScreen>
  );
}

function CardButton({
  label,
  icon,
  onPress,
  primary,
  danger,
  solidEnd,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  solidEnd?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const iconColor = solidEnd || primary ? COLORS.white : danger ? '#B3261E' : '#2B1F27';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.cardBtn,
        primary && styles.cardBtnPrimary,
        danger && styles.cardBtnDanger,
        solidEnd && styles.cardBtnSolidEnd,
        disabled && styles.cardBtnDisabled,
        pressed &&
          !disabled &&
          (solidEnd
            ? styles.cardBtnSolidEndPressed
            : danger
              ? styles.cardBtnDangerPressed
              : styles.cardBtnPressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}>
      <Ionicons name={icon} size={solidEnd ? 14 : 16} color={iconColor} />
      <Text
        style={[
          styles.cardBtnLabel,
          primary && styles.cardBtnLabelPrimary,
          danger && styles.cardBtnLabelDanger,
          solidEnd && styles.cardBtnLabelSolidEnd,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  sessionBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1E4EC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sessionIdleBanner: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  sessionBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#4A1F3D',
    lineHeight: 16,
  },
  sessionBannerCode: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  hero: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: '#6B3A5C',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#EADBE5',
    lineHeight: 16,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 12,
  },
  createBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  createBtnPressed: { backgroundColor: '#F4EAF0' },
  createBtnLabel: {
    flexShrink: 1,
    color: '#6B3A5C',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  endHeaderBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  endHeaderBtnPressed: { backgroundColor: '#DC2626' },
  endHeaderLabel: {
    flexShrink: 1,
    color: COLORS.white,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  filters: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  listHeader: {
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 14,
    marginHorizontal: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  cardTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
  },
  cardCodeGroup: {
    marginLeft: 'auto',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  codeMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1,
    color: COLORS.plum,
  },
  copyIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    textTransform: 'uppercase',
  },
  badgeActiveText: { color: '#15803D' },
  badgeEndedText: { color: '#5F5460' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: '#5F5460',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  cardBtn: {
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  cardBtnPrimary: {
    backgroundColor: '#6B3A5C',
    borderColor: '#6B3A5C',
  },
  cardBtnDisabled: {
    opacity: 0.55,
  },
  sessionHint: {
    width: '100%',
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  cardBtnDanger: {
    borderColor: '#F5B5B0',
  },
  cardBtnSolidEnd: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  cardBtnPressed: {
    backgroundColor: '#F7F2F5',
  },
  cardBtnDangerPressed: {
    backgroundColor: '#FBEAE8',
  },
  cardBtnSolidEndPressed: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  cardBtnLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  cardBtnLabelPrimary: { color: COLORS.white },
  cardBtnLabelDanger: { color: '#B3261E' },
  cardBtnLabelSolidEnd: { color: COLORS.white },
  pressed: { opacity: 0.85 },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING[4],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[5],
    ...SHADOWS.raised,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING[4],
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  stepLine: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5A4A55',
    marginBottom: SPACING[2],
  },
});
