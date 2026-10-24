import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { LaunchQuizSettingsModal } from '@/components/LaunchQuizSettingsModal';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions } from '@/context/HostSessionContext';
import { normalizeQuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import {
  deleteQuiz,
  finishQuiz,
  listTeacherQuizzes,
  quizBucket,
  subscribeTeacherQuizzes,
  type HostQuiz,
} from '@/lib/hostQuizzes';
import { formatSessionDate } from '@/lib/formatLocalDateTime';
import { autoFinishExpiredQuiz } from '@/lib/quizAutoFinish';
import { getQuizTimeRemaining, isQuizExpired } from '@/lib/quizExpiry';
import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

/** Web ListFilterBar tabs — chip label "Launched" filters status `launched`. */
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'launched', label: 'Launched' },
  { id: 'finished', label: 'Finished' },
] as const;

const HERO_PLUM = '#6D415F';
const BANNER_BG = '#F1E5EB';
const BANNER_BORDER = 'rgba(109, 65, 95, 0.2)';
const CARD_BORDER = 'rgba(142, 124, 195, 0.2)';

/** Coerce RTDB/API createdAt (ISO, ms, seconds, Firebase timestamp object) for local display. */
function quizCreatedStamp(quiz: HostQuiz): unknown {
  const raw = (quiz as { createdAt?: unknown; createdDate?: unknown }).createdAt
    ?? (quiz as { createdDate?: unknown }).createdDate
    ?? null;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    const o = raw as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof o.seconds === 'number') return o.seconds * 1000;
    if (typeof o._seconds === 'number') return o._seconds * 1000;
    if (typeof o.toDate === 'function') return o.toDate();
  }
  if (typeof raw === 'number' && raw > 0 && raw < 1e12) return raw * 1000;
  const asText = String(raw).trim();
  if (/^\d{10}$/.test(asText)) return Number(asText) * 1000;
  if (/^\d{13}$/.test(asText)) return Number(asText);
  return raw;
}

function formatQuizDate(quiz: HostQuiz) {
  return formatSessionDate(quizCreatedStamp(quiz)).date;
}

function formatQuizTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function statusBadgeLabel(quiz: HostQuiz) {
  const bucket = quizBucket(quiz);
  if (bucket === 'finished') return 'Finished';
  if (bucket === 'launched') return 'Launched';
  return 'Ready';
}

export default function QuizLibraryScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { activeSession, createSession } = useHostSessions();
  const teacherId = profile?.uid || '';

  const [quizzes, setQuizzes] = useState<HostQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [launchQuizItem, setLaunchQuizItem] = useState<HostQuiz | null>(null);
  const [launchedCode, setLaunchedCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HostQuiz | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [createdSessionCode, setCreatedSessionCode] = useState('');
  const [nowTick, setNowTick] = useState(0);
  const pendingQuizDeletes = useRef(new Set<string>());
  const pendingQuizFinishes = useRef(new Set<string>());
  const pendingQuizLaunches = useRef(new Map<string, HostQuiz>());

  const isActive = Boolean(activeSession);
  const sessionCode = String(activeSession?.sessionCode || '')
    .trim()
    .toUpperCase();

  useEffect(() => {
    if (!teacherId) {
      setQuizzes([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let cancelled = false;
    let sawRtdbRows = false;

    const applyRows = (rows: HostQuiz[]) => {
      if (cancelled) return;
      pendingQuizDeletes.current.forEach((id) => {
        if (!rows.some((q) => q.id === id)) pendingQuizDeletes.current.delete(id);
      });
      pendingQuizFinishes.current.forEach((id) => {
        const row = rows.find((q) => q.id === id);
        if (!row || quizBucket(row) !== 'launched') pendingQuizFinishes.current.delete(id);
      });
      pendingQuizLaunches.current.forEach((_pending, id) => {
        const row = rows.find((q) => q.id === id);
        if (row && quizBucket(row) === 'launched') pendingQuizLaunches.current.delete(id);
      });
      const mapped = rows
        .filter((q) => !pendingQuizDeletes.current.has(q.id))
        .map((q) => {
          if (pendingQuizFinishes.current.has(q.id)) {
            return { ...q, status: 'ready', launched: false };
          }
          const launchedOverlay = pendingQuizLaunches.current.get(q.id);
          if (launchedOverlay && quizBucket(q) !== 'launched') {
            return {
              ...q,
              ...launchedOverlay,
              id: q.id,
              launched: true,
              status: launchedOverlay.status || 'launched',
            };
          }
          return q;
        });
      // Do not let an older Finished snapshot replace a newer Launched row
      // (Web GET /quizzes is the same source as listTeacherQuizzes).
      setQuizzes((prev) =>
        mapped.map((q) => {
          const old = prev.find((p) => p.id === q.id);
          if (old && quizBucket(old) === 'launched' && quizBucket(q) === 'finished') {
            const oldTs = Date.parse(String(old.updatedAt || '')) || 0;
            const newTs = Date.parse(String(q.updatedAt || '')) || 0;
            if (newTs <= oldTs) return old;
          }
          return q;
        })
      );
      setLoading(false);
    };

    const loadApiList = () => {
      listTeacherQuizzes(teacherId)
        .then((rows) => {
          if (cancelled) return;
          applyRows(rows);
        })
        .catch(() => {
          if (!cancelled && !sawRtdbRows) applyRows([]);
        });
    };

    const unsubscribe = subscribeTeacherQuizzes(
      teacherId,
      (rows) => {
        if (rows.length > 0) {
          sawRtdbRows = true;
          applyRows(rows);
          return;
        }
        loadApiList();
      },
      () => loadApiList()
    );

    // Web Quiz Library always GET /quizzes (`syncQuizzes`). Do the same on
    // mount so a stale RTDB Finished row cannot hide a live launch.
    loadApiList();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [teacherId]);

  // Tick for live countdown on launched quizzes (Web QuizTimer).
  useEffect(() => {
    const hasTimer = quizzes.some((q) => q.launched && q.launchSettings?.endTime);
    if (!hasTimer) return undefined;
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [quizzes]);

  const stats = useMemo(() => {
    const total = quizzes.length;
    const ready = quizzes.filter((q) => quizBucket(q) === 'ready').length;
    const active = quizzes.filter((q) => quizBucket(q) === 'launched').length;
    const finished = quizzes.filter((q) => quizBucket(q) === 'finished').length;
    return { total, ready, active, finished };
  }, [quizzes, nowTick]);

  const hasActiveQuiz = useMemo(
    () => quizzes.some((q) => quizBucket(q) === 'launched'),
    [quizzes, nowTick]
  );

  const fromSession = getSessionActivityLabel(activeSession?.currentActivity, quizzes);
  const activityLabel =
    fromSession !== 'No active activity'
      ? fromSession
      : hasActiveQuiz
        ? 'Active Quiz'
        : fromSession;

  const filtered = useMemo(() => {
    let rows = quizzes;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((quiz) => String(quiz.title || '').toLowerCase().includes(term));
    }
    switch (filter) {
      case 'ready':
        return rows.filter((q) => quizBucket(q) === 'ready');
      case 'launched':
        return rows.filter((q) => quizBucket(q) === 'launched');
      case 'finished':
        return rows.filter((q) => quizBucket(q) === 'finished');
      default:
        return rows;
    }
  }, [quizzes, search, filter, nowTick]);

  const onEdit = (quiz: HostQuiz) => {
    router.push(`/host/quiz/edit/${quiz.id}` as Href);
  };

  const onLaunch = (quiz: HostQuiz) => {
    if (!activeSession?.sessionCode) {
      setShowCreateSession(true);
      return;
    }
    setLaunchQuizItem(quiz);
  };

  const refreshQuizzesFromApi = useCallback(() => {
    if (!teacherId) return;
    listTeacherQuizzes(teacherId)
      .then((rows) => {
        pendingQuizDeletes.current.forEach((id) => {
          if (!rows.some((q) => q.id === id)) pendingQuizDeletes.current.delete(id);
        });
        pendingQuizFinishes.current.forEach((id) => {
          const row = rows.find((q) => q.id === id);
          if (!row || quizBucket(row) !== 'launched') pendingQuizFinishes.current.delete(id);
        });
        pendingQuizLaunches.current.forEach((_, id) => {
          const row = rows.find((q) => q.id === id);
          if (row && quizBucket(row) === 'launched') pendingQuizLaunches.current.delete(id);
        });
        setQuizzes(
          rows
            .filter((q) => !pendingQuizDeletes.current.has(q.id))
            .map((q) => {
              if (pendingQuizFinishes.current.has(q.id)) {
                return { ...q, status: 'ready', launched: false };
              }
              const launchedOverlay = pendingQuizLaunches.current.get(q.id);
              if (launchedOverlay && quizBucket(q) !== 'launched') {
                return {
                  ...q,
                  ...launchedOverlay,
                  id: q.id,
                  launched: true,
                  status: launchedOverlay.status || 'launched',
                };
              }
              return q;
            })
        );
      })
      .catch(() => {
        // Keep the live list; launch/finish already updated local state.
      });
  }, [teacherId]);

  const onFinish = useCallback(async (quiz: HostQuiz) => {
    try {
      await finishQuiz(quiz.id);
      pendingQuizLaunches.current.delete(quiz.id);
      pendingQuizFinishes.current.add(quiz.id);
      setQuizzes((prev) =>
        prev.map((q) => (q.id === quiz.id ? { ...q, status: 'ready', launched: false } : q))
      );
      showToast({ type: 'success', title: 'Quiz finished' });
      refreshQuizzesFromApi();
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Finish failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    }
  }, [refreshQuizzesFromApi]);

  useEffect(() => {
    quizzes.forEach((quiz) => {
      if (!isQuizExpired(quiz)) return;
      void autoFinishExpiredQuiz(quiz).then((didFinish) => {
        if (!didFinish) return;
        pendingQuizLaunches.current.delete(quiz.id);
        pendingQuizFinishes.current.add(quiz.id);
        setQuizzes((prev) =>
          prev.map((q) => (q.id === quiz.id ? { ...q, status: 'ready', launched: false } : q))
        );
        showToast({ type: 'success', title: 'Quiz finished' });
        refreshQuizzesFromApi();
      });
    });
  }, [quizzes, nowTick, refreshQuizzesFromApi]);

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuiz(deleteTarget.id);
      pendingQuizDeletes.current.add(deleteTarget.id);
      setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast({
        type: 'success',
        title: 'Removed',
        message: 'Quiz removed from library. Audience reports are preserved.',
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Delete failed',
        message: cleanErrorMessage(error, 'Failed to delete quiz'),
        primary: { label: 'Close' },
      });
    } finally {
      setDeleting(false);
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

  const copyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      showToast({ type: 'success', title: 'Copied', message: 'Access code copied to clipboard' });
    } catch {
      showAlert({
        type: 'error',
        title: 'Copy failed',
        message: 'Could not copy access code',
        primary: { label: 'Close' },
      });
    }
  };

  const listPadBottom = TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4];

  const renderHeader = () => (
    <View style={styles.topBlock}>
      {/* SessionLaunchBanner — same conditions as Web */}
      <View style={styles.banner} accessibilityRole="text">
        {isActive ? (
          <>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
            <Text style={styles.bannerText}>
              Launching to session:{' '}
              <Text style={styles.bannerCode}>{sessionCode || '—'}</Text>
              {' · '}
              {activityLabel}
            </Text>
          </>
        ) : (
          <>
            <Ionicons name="warning-outline" size={16} color={COLORS.primary} />
            <Text style={styles.bannerText}>
              {"You'll need an active session to launch this. "}
              <Text
                style={styles.bannerLink}
                onPress={() => setShowCreateSession(true)}
                accessibilityRole="button"
                accessibilityLabel="Create Session">
                Create Session
              </Text>
            </Text>
          </>
        )}
      </View>

      {/* Mobile hero — solid primary (same token as Launch Quiz / All chip) */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Quiz Library</Text>
        <Text style={styles.heroSubtitle}>Manage and organize your quizzes</Text>
        <View style={styles.heroStats}>
          {[
            { label: 'Total', value: stats.total },
            { label: 'Ready', value: stats.ready },
            { label: 'Active', value: stats.active },
            { label: 'Finished', value: stats.finished },
          ].map((item) => (
            <View key={item.label} style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>{item.label}</Text>
              <Text style={styles.heroStatValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Filter chips — Web ListFilterBar order; "Launched" label for `launched` */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}>
        {FILTERS.map((item) => {
          const selected = filter === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setFilter(item.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipActive,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}>
              <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.inkSecondary} style={styles.searchIcon} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search quizzes..."
          placeholderTextColor={COLORS.inkSecondary}
          style={styles.search}
          accessibilityLabel="Search quizzes"
        />
      </View>

      {hasActiveQuiz && filtered.length > 0 ? (
        <View style={styles.activeNotice}>
          <View style={styles.activeNoticeIcon}>
            <Ionicons name="warning-outline" size={16} color={HERO_PLUM} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeNoticeTitle}>Only one quiz can be active at a time</Text>
            <Text style={styles.activeNoticeBody}>
              Finish the current active quiz before launching another one
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderCard = ({ item }: { item: HostQuiz }) => {
    const bucket = quizBucket(item);
    const badge = statusBadgeLabel(item);
    // Web always uses "{n} questions" (no singular form).
    const qCount = item.questionCount ?? item.questions?.length ?? 0;
    const typeLabel = normalizeQuizTypeLabel(item.type);
    const title = item.title || 'Untitled Quiz';
    const remaining = getQuizTimeRemaining(item);
    // nowTick keeps countdown fresh
    void nowTick;
    const accessCode = item.launchSettings?.accessCode || item.accessCode || '';
    const timerExpired = remaining === 0;

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>

        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              badge === 'Finished'
                ? styles.badgeFinished
                : badge === 'Launched'
                  ? styles.badgeLaunched
                  : styles.badgeReady,
            ]}>
            <Text
              style={[
                styles.badgeText,
                badge === 'Finished'
                  ? styles.badgeTextFinished
                  : badge === 'Launched'
                    ? styles.badgeTextLaunched
                    : styles.badgeTextReady,
              ]}>
              {badge}
            </Text>
          </View>
          <View style={styles.badgeType}>
            <Text style={styles.badgeTypeText}>{typeLabel}</Text>
          </View>
          <Text style={styles.questionCount}>{qCount} questions</Text>
        </View>

        {bucket === 'launched' && remaining !== null ? (
          <View style={styles.timerRow}>
            <Ionicons
              name="time-outline"
              size={16}
              color={timerExpired ? COLORS.danger : remaining < 300 ? '#EA580C' : '#2563EB'}
            />
            <Text
              style={[
                styles.timerText,
                {
                  color: timerExpired ? COLORS.danger : remaining < 300 ? '#EA580C' : '#2563EB',
                },
              ]}>
              Time left: {formatQuizTime(remaining)}
            </Text>
          </View>
        ) : null}

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.inkSecondary} />
          <Text style={styles.dateText}>
            {formatQuizDate(item)}
          </Text>
        </View>

        {bucket === 'launched' && accessCode ? (
          <View style={styles.codeBox}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.codeLabel}>Audience Access Code</Text>
              <Text style={styles.codeValue} selectable>
                {String(accessCode).toUpperCase()}
              </Text>
            </View>
            <Pressable
              onPress={() => copyCode(String(accessCode))}
              disabled={timerExpired}
              style={({ pressed }) => [
                styles.copyBtn,
                timerExpired && styles.copyBtnDisabled,
                pressed && !timerExpired && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Copy access code"
              accessibilityState={{ disabled: timerExpired }}>
              <Ionicons name="copy-outline" size={16} color={timerExpired ? COLORS.muted : COLORS.white} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actionsCol}>
          {bucket === 'launched' ? (
            <Pressable
              onPress={() => onFinish(item)}
              disabled={timerExpired}
              style={({ pressed }) => [
                styles.launchBtn,
                timerExpired && styles.launchBtnDisabled,
                pressed && !timerExpired && styles.launchBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={timerExpired ? 'Quiz Expired' : 'Finish Quiz'}
              accessibilityState={{ disabled: timerExpired }}>
              <Ionicons name="flag-outline" size={18} color={COLORS.white} />
              <Text style={styles.launchBtnLabel}>
                {timerExpired ? 'Quiz Expired' : 'Finish Quiz'}
              </Text>
            </Pressable>
          ) : hasActiveQuiz ? (
            <Pressable
              disabled
              style={[styles.launchBtn, styles.launchBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Quiz Active - Cannot Launch"
              accessibilityState={{ disabled: true }}>
              <Ionicons name="rocket-outline" size={18} color={COLORS.white} />
              <Text style={styles.launchBtnLabel}>Quiz Active - Cannot Launch</Text>
            </Pressable>
          ) : (
            <View style={styles.launchBlock}>
              <Pressable
                onPress={() => onLaunch(item)}
                style={({ pressed }) => [styles.launchBtn, pressed && styles.launchBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Launch Quiz">
                <Ionicons name="rocket-outline" size={18} color={COLORS.white} />
                <Text style={styles.launchBtnLabel}>Launch Quiz</Text>
              </Pressable>
              {/* Web LaunchRequiresSessionHint — always under Launch; button stays enabled */}
              <Text style={styles.sessionHint}>Requires an active session</Text>
            </View>
          )}

          <View style={styles.secondaryRow}>
            <Pressable
              onPress={() => onEdit(item)}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Edit quiz ${title}`}>
              <Ionicons name="create-outline" size={16} color="#374151" />
              <Text style={styles.secondaryLabel}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => setDeleteTarget(item)}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.deleteBtn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Delete quiz ${title}`}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteLabel}>Delete</Text>
            </Pressable>
          </View>
        </View>

        {hasActiveQuiz && bucket !== 'launched' ? (
          <View style={styles.lockedBlock}>
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.muted} />
              <Text style={styles.lockedTitle}>Waiting for the active quiz to finish</Text>
            </View>
            <Text style={styles.lockedBody}>
              You can launch this quiz once the current one is completed
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading quizzes…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          {...KEYBOARD_SCROLL_PROPS}
          extraData={{ quizzes, activityLabel, hasActiveQuiz, filter, nowTick }}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {search.trim()
                  ? 'No quizzes found'
                  : quizzes.length === 0
                    ? 'Your library is empty'
                    : 'No quizzes match this filter'}
              </Text>
              <Text style={styles.emptyBody}>
                {search.trim()
                  ? 'Try adjusting your search terms'
                  : quizzes.length === 0
                    ? 'Create and save quizzes to see them here'
                    : 'Try selecting a different filter'}
              </Text>
              <Pressable
                onPress={() => router.push('/host/quiz' as Href)}
                style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Create Quiz">
                <Ionicons name="add" size={16} color={COLORS.white} />
                <Text style={styles.emptyCtaLabel}>Create Quiz</Text>
              </Pressable>
            </View>
          }
          renderItem={renderCard}
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
        />
      )}

      <LaunchQuizSettingsModal
        visible={Boolean(launchQuizItem)}
        quiz={launchQuizItem}
        accessCode={activeSession?.sessionCode || ''}
        onClose={() => setLaunchQuizItem(null)}
        onLaunched={(launched) => {
          const id = launched.id || launchQuizItem?.id || '';
          const nextQuiz: HostQuiz = {
            ...launchQuizItem,
            ...launched,
            id,
            launched: true,
            status: launched.status || 'launched',
          };
          pendingQuizFinishes.current.delete(id);
          pendingQuizLaunches.current.set(id, nextQuiz);
          setQuizzes((prev) => {
            const mapped = prev.map((q) => (q.id === id ? { ...q, ...nextQuiz } : q));
            return mapped.some((q) => q.id === id) ? mapped : [nextQuiz, ...prev];
          });
          setLaunchedCode(
            launched.launchSettings?.accessCode ||
              launched.accessCode ||
              activeSession?.sessionCode ||
              ''
          );
          setLaunchQuizItem(null);
          refreshQuizzesFromApi();
        }}
      />

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Quiz Launched"
        code={launchedCode}
        onClose={() => setLaunchedCode('')}
      />

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="Delete Quiz"
        message="Remove this quiz from your library? The audience will not be able to attempt it again, but existing scores and reports will be kept."
        confirmLabel="Delete"
        destructive
        busy={deleting}
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
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  list: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
  },
  cardGap: { height: 16 },
  topBlock: { gap: SPACING[4], marginBottom: SPACING[2] },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: BANNER_BG,
    borderWidth: 1,
    borderColor: BANNER_BORDER,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
  },
  bannerText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 18,
  },
  bannerCode: {
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1,
  },
  bannerLink: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: HERO_PLUM,
    textDecorationLine: 'underline',
  },
  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(109, 65, 95, 0.3)',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    overflow: 'hidden',
    ...SHADOWS.raised,
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: FONT_WEIGHTS.bold,
  },
  heroSubtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 16,
  },
  heroStats: {
    marginTop: SPACING[2.5],
    flexDirection: 'row',
  },
  heroStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  heroStatLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  heroStatValue: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    paddingVertical: 2,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(109, 65, 95, 0.15)',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.inkSecondary,
  },
  chipLabelActive: {
    color: COLORS.white,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(109, 65, 95, 0.15)',
    minHeight: 44,
    paddingHorizontal: SPACING[3],
  },
  searchIcon: { marginRight: SPACING[2] },
  search: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    color: COLORS.ink,
    paddingVertical: 0,
  },
  activeNotice: {
    flexDirection: 'row',
    gap: SPACING[3],
    alignItems: 'flex-start',
    backgroundColor: 'rgba(142, 124, 195, 0.1)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: SPACING[4],
  },
  activeNoticeIcon: {
    padding: SPACING[2],
    backgroundColor: 'rgba(109, 65, 95, 0.1)',
    borderRadius: RADIUS.md,
  },
  activeNoticeTitle: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.mutedText,
  },
  activeNoticeBody: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
  },
  loadingText: { color: COLORS.inkSecondary, fontSize: 14 },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: SPACING[8],
    alignItems: 'center',
    ...SHADOWS.card,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ink,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  emptyBody: {
    fontSize: 14,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    marginBottom: SPACING[6],
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  emptyCtaLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 14,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 20,
    width: '100%',
    ...SHADOWS.raised,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#111827',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  badgeReady: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  badgeLaunched: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  badgeFinished: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  badgeTextReady: { color: '#15803D' },
  badgeTextLaunched: { color: '#1D4ED8' },
  badgeTextFinished: { color: '#374151' },
  badgeType: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(142, 124, 195, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(142, 124, 195, 0.3)',
  },
  badgeTypeText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: HERO_PLUM,
  },
  questionCount: {
    fontSize: 14,
    color: '#4B5563',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: 12,
  },
  timerText: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 14,
    color: '#6B7280',
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.mutedText,
    marginBottom: 2,
  },
  codeValue: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.ink,
    letterSpacing: 2,
  },
  copyBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: HERO_PLUM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  actionsCol: { gap: 12 },
  launchBlock: { width: '100%' },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: HERO_PLUM,
    paddingHorizontal: SPACING[4],
    width: '100%',
    ...SHADOWS.card,
  },
  launchBtnPressed: { backgroundColor: '#5A344D' },
  launchBtnDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.85,
  },
  launchBtnLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sessionHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[3],
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#374151',
  },
  deleteBtn: {
    borderColor: '#FCA5A5',
  },
  deleteLabel: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#DC2626',
  },
  lockedBlock: {
    marginTop: SPACING[4],
    paddingTop: SPACING[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: SPACING[1],
  },
  lockedTitle: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.muted,
  },
  lockedBody: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  pressed: { opacity: 0.85 },
});
