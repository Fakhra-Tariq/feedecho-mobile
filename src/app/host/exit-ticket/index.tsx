import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showAlert, showToast } from '@/components/feedback';
import { EmptyState } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions } from '@/context/HostSessionContext';
import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';
import {
  cleanErrorMessage,
  showLaunchFailureAlert,
} from '@/lib/activeActivity';
import {
  archiveExitTicket,
  attachQuestionsToTickets,
  deleteExitTicket,
  displayTicketStatus,
  endExitTicket,
  getExitTicketById,
  listExitTickets,
  startExitTicket,
  ticketQuestionCount,
  type ExitTicket,
} from '@/lib/hostExitTickets';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'ended', label: 'Ended' },
] as const;

/** Display-only: Active tickets first, then the existing recency order (stable). */
function sortTicketsForDisplay(tickets: ExitTicket[]) {
  const active: ExitTicket[] = [];
  const rest: ExitTicket[] = [];
  for (const ticket of tickets) {
    if (displayTicketStatus(ticket.status) === 'active') active.push(ticket);
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
  const { profile } = useAuth();
  const { activeSession, quizzes } = useHostSessions();
  const uid = profile?.uid || '';

  const { list: liveTickets, loading: liveLoading } = useRtdbList(uid ? 'exit_tickets' : null, {
    enabled: Boolean(uid),
    filter: (t) => t.createdBy === uid,
    sort: (a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
  });
  const { value: questionsTree, loading: questionsLoading } = useRtdbValue(
    uid ? 'exit_questions' : null,
    {
      enabled: Boolean(uid),
    }
  );

  const [tickets, setTickets] = useState<ExitTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ExitTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [launchedCode, setLaunchedCode] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ExitTicket>>(null);
  const prevActiveTicketId = useRef<string | null>(null);
  const pendingTicketDeletes = useRef(new Set<string>());
  const pendingTicketEnds = useRef(new Set<string>());
  const questionDetailRequested = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) {
      setTickets([]);
      setLoading(false);
      return;
    }
    if (liveLoading || questionsLoading) return;
    if (liveTickets.length > 0) {
      pendingTicketDeletes.current.forEach((id) => {
        if (!liveTickets.some((t) => t.id === id)) pendingTicketDeletes.current.delete(id);
      });
      pendingTicketEnds.current.forEach((id) => {
        const live = liveTickets.find((t) => t.id === id);
        const status = live ? displayTicketStatus(live.status) : '';
        if (!live || status === 'ended' || status === 'paused') {
          pendingTicketEnds.current.delete(id);
        }
      });
      setTickets((prev) => {
        const prevById = Object.fromEntries(prev.map((t) => [t.id, t]));
        return attachQuestionsToTickets(
          liveTickets.filter((t) => !pendingTicketDeletes.current.has(t.id)),
          questionsTree,
          prevById
        ).map((t) => (pendingTicketEnds.current.has(t.id) ? { ...t, status: 'ended' } : t));
      });
      setLoading(false);
      return;
    }
    listExitTickets()
      .then((rows) => {
        pendingTicketDeletes.current.forEach((id) => {
          if (!rows.some((t) => t.id === id)) pendingTicketDeletes.current.delete(id);
        });
        pendingTicketEnds.current.forEach((id) => {
          const live = rows.find((t) => t.id === id);
          const status = live ? displayTicketStatus(live.status) : '';
          if (!live || status === 'ended' || status === 'paused') {
            pendingTicketEnds.current.delete(id);
          }
        });
        setTickets((prev) => {
          const prevById = Object.fromEntries(prev.map((t) => [t.id, t]));
          return attachQuestionsToTickets(
            rows.filter((t) => !pendingTicketDeletes.current.has(t.id)),
            questionsTree,
            prevById
          ).map((t) => (pendingTicketEnds.current.has(t.id) ? { ...t, status: 'ended' } : t));
        });
      })
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [uid, liveTickets, liveLoading, questionsTree, questionsLoading]);

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
    const drafts = tickets.filter((t) => displayTicketStatus(t.status) === 'draft').length;
    const active = tickets.filter((t) => displayTicketStatus(t.status) === 'active').length;
    const ended = tickets.filter((t) => {
      const s = displayTicketStatus(t.status);
      return s === 'ended' || s === 'paused';
    }).length;
    return { drafts, active, ended };
  }, [tickets]);

  const activeTicket = tickets.find((t) => displayTicketStatus(t.status) === 'active');

  const filtered = useMemo(() => {
    let rows = tickets;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((t) => String(t.title || '').toLowerCase().includes(term));
    }
    if (filter !== 'all') {
      rows = rows.filter((t) => displayTicketStatus(t.status) === filter);
    }
    return sortTicketsForDisplay(rows);
  }, [tickets, search, filter]);

  useEffect(() => {
    const id = activeTicket?.id || null;
    if (id && id !== prevActiveTicketId.current) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    prevActiveTicketId.current = id;
  }, [activeTicket?.id]);

  const sessionCode = activeSession?.sessionCode || '—';
  const activityStatus = getSessionActivityLabel(activeSession?.currentActivity, quizzes);

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

  const onLaunch = async (ticket: ExitTicket) => {
    if (!requireSession()) return;
    try {
      const launched = await startExitTicket(ticket.id);
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, ...launched } : t))
      );
      setLaunchedCode(launched.joinCode || '');
    } catch (error) {
      showLaunchFailureAlert(activeSession?.currentActivity, error);
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

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <View style={styles.sessionBanner} accessibilityRole="text">
        <Ionicons
          name={activeSession ? 'checkmark-circle' : 'alert-circle-outline'}
          size={16}
          color="#4A1F3D"
        />
        <Text style={styles.sessionBannerText}>
          {activeSession
            ? `Launching to session: ${sessionCode} · ${activityStatus}`
            : 'No active session — create one on Explore to launch tickets.'}
        </Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          <Text style={styles.heroTitle}>Exit Ticket</Text>
          <Pressable
            onPress={() => setShowHowItWorks(true)}
            style={({ pressed }) => [styles.howItWorks, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="How it works">
            <Ionicons name="help-circle-outline" size={14} color="#EADBE5" />
            <Text style={styles.howItWorksText}>How it works</Text>
            <Ionicons name="chevron-forward" size={12} color="#EADBE5" />
          </Pressable>
        </View>
        <Text style={styles.heroSubtitle}>
          Collect anonymous audience feedback and track attendance
        </Text>

        <View style={styles.stats}>
          {[
            ['Drafts', stats.drafts],
            ['Active', stats.active],
            ['Ended', stats.ended],
          ].map(([label, value]) => (
            <View key={String(label)} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

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

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const on = filter === item.id;
          return (
            <Pressable
              key={item.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => setFilter(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Filter: ${item.label}`}>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color="#8A7F89" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search exit tickets..."
          placeholderTextColor="#8A7F89"
          style={styles.search}
          accessibilityLabel="Search exit tickets"
        />
      </View>

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
          contentContainerStyle={[
            styles.list,
            { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4] },
          ]}
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
            const status = displayTicketStatus(item.status);
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
                        icon="rocket-outline"
                        primary
                        onPress={() => onLaunch(item)}
                        accessibilityLabel="Launch exit ticket"
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
  accessibilityLabel,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  solidEnd?: boolean;
  accessibilityLabel: string;
}) {
  const iconColor = solidEnd || primary ? COLORS.white : danger ? '#B3261E' : '#2B1F27';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardBtn,
        primary && styles.cardBtnPrimary,
        danger && styles.cardBtnDanger,
        solidEnd && styles.cardBtnSolidEnd,
        pressed &&
          (solidEnd
            ? styles.cardBtnSolidEndPressed
            : danger
              ? styles.cardBtnDangerPressed
              : styles.cardBtnPressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
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
  sessionBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#4A1F3D',
    lineHeight: 16,
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
  howItWorks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  howItWorksText: {
    fontSize: 12,
    color: '#EADBE5',
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#EADBE5',
    lineHeight: 16,
  },
  stats: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 18,
  },
  statLabel: {
    color: '#EADBE5',
    fontSize: 11,
    marginTop: 2,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: '#6B3A5C',
    borderColor: '#6B3A5C',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  chipLabelOn: { color: COLORS.white },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    height: 44,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8DFE6',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  search: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    paddingVertical: 0,
  },
  list: {
    paddingTop: 16,
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
