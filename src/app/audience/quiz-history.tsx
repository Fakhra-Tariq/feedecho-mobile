import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ConfirmModal';
import { KeyboardAwareBottomSheet } from '@/components/KeyboardAwareBottomSheet';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  getStudentQuizHistory,
  localQuizHistoryRows,
  mergeQuizHistoryRows,
  studentQueryFromProfile,
  type QuizHistoryRow,
} from '@/lib/studentsActivity';

const HIDDEN_KEY = 'quizHistoryHiddenIds';
/** Same threshold as Web QuizHistory.js */
const PASS_THRESHOLD = 60;

const FILTER_OPTIONS = [
  'All Quizzes',
  'Last 4 Hours',
  'Last 7 Days',
  'Passed Only',
  'Failed Only',
] as const;

type FilterOption = (typeof FILTER_OPTIONS)[number];

function attemptPercentage(row: QuizHistoryRow) {
  return Number(row.percentage ?? 0);
}

function isPassed(row: QuizHistoryRow) {
  return attemptPercentage(row) >= PASS_THRESHOLD;
}

function totalQuestionsOf(row: QuizHistoryRow) {
  return Number(row.totalQuestions ?? row.maxScore ?? 0);
}

function correctAnswersOf(row: QuizHistoryRow) {
  const total = totalQuestionsOf(row);
  const percentage = attemptPercentage(row);
  if (row.correctAnswers != null) return Number(row.correctAnswers);
  if (row.score != null && Number(row.score) <= total) return Number(row.score);
  if (total > 0) return Math.round((percentage / 100) * total);
  return 0;
}

/** Web: timeTaken seconds → Math.max(1, round(seconds/60)), or 0 if missing. */
function durationMinutes(row: QuizHistoryRow) {
  const raw = row.timeTaken;
  if (raw == null || raw === '') return 0;
  return Math.max(1, Math.round(Number(raw) / 60));
}

function attemptDateLabel(row: QuizHistoryRow) {
  const iso = String(row.submittedAt || '');
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function attemptTitle(row: QuizHistoryRow) {
  return String(row.title || row.name || 'Quiz');
}

function attemptListKey(row: QuizHistoryRow, index: number) {
  const quizId = String(row.quizId || '').trim();
  const participantId = String(row.participantId || '').trim();
  const submittedAt = String(row.submittedAt || '').trim();
  const id = String(row.id || '').trim();
  if (quizId && participantId) return `quiz-${quizId}-p-${participantId}#${index}`;
  if (id) return `${id}#${index}`;
  if (quizId && submittedAt) return `quiz-${quizId}-at-${submittedAt}#${index}`;
  return `attempt-${index}-${quizId}-${submittedAt}`;
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={16} color={COLORS.white} />
      </View>
      <View style={styles.statCopy}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function AudienceQuizHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<QuizHistoryRow[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewItem, setViewItem] = useState<QuizHistoryRow | null>(null);
  const [deleteItem, setDeleteItem] = useState<QuizHistoryRow | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOption, setFilterOption] = useState<FilterOption>('All Quizzes');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftFilter, setDraftFilter] = useState<FilterOption>('All Quizzes');
  const hasLoadedRef = useRef(false);

  const loadHistory = useCallback(async () => {
    if (authLoading) return;
    const query = studentQueryFromProfile(profile, user);
    if (!query.uid && !query.email && !query.name) {
      setRows([]);
      setLoadError('');
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError('');
    try {
      const rawHidden = await AsyncStorage.getItem(HIDDEN_KEY);
      if (rawHidden) {
        try {
          setHiddenIds(JSON.parse(rawHidden));
        } catch {
          setHiddenIds([]);
        }
      }
      const [server, local] = await Promise.all([
        getStudentQuizHistory({ ...query, limit: 200 }),
        localQuizHistoryRows(query),
      ]);
      setRows(mergeQuizHistoryRows(server, local));
      hasLoadedRef.current = true;
    } catch (err) {
      setRows([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load quiz history');
    } finally {
      setLoading(false);
    }
  }, [authLoading, profile, user]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory])
  );

  const visible = useMemo(
    () => rows.filter((row) => !hiddenIds.includes(row.id)),
    [rows, hiddenIds]
  );

  const stats = useMemo(() => {
    const totalQuizzes = visible.length;
    const averageScore =
      totalQuizzes > 0
        ? visible.reduce((sum, row) => sum + attemptPercentage(row), 0) / totalQuizzes
        : 0;
    const bestScore =
      totalQuizzes > 0 ? Math.max(...visible.map((row) => attemptPercentage(row))) : 0;
    const mostRecent = totalQuizzes > 0 ? attemptTitle(visible[0]) : '—';
    return { totalQuizzes, averageScore, bestScore, mostRecent };
  }, [visible]);

  const filtered = useMemo(() => {
    let next = [...visible];
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      next = next.filter((row) => attemptTitle(row).toLowerCase().includes(term));
    }
    const now = Date.now();
    if (filterOption === 'Last 4 Hours') {
      next = next.filter((row) => {
        const t = new Date(String(row.submittedAt || '')).getTime();
        return !Number.isNaN(t) && (now - t) / (1000 * 60 * 60) <= 4;
      });
    } else if (filterOption === 'Last 7 Days') {
      next = next.filter((row) => {
        const t = new Date(String(row.submittedAt || '')).getTime();
        return !Number.isNaN(t) && (now - t) / (1000 * 60 * 60 * 24) <= 7;
      });
    } else if (filterOption === 'Passed Only') {
      next = next.filter((row) => isPassed(row));
    } else if (filterOption === 'Failed Only') {
      next = next.filter((row) => !isPassed(row));
    }
    return next;
  }, [visible, searchTerm, filterOption]);

  const onConfirmDelete = async () => {
    if (!deleteItem) return;
    const next = [...hiddenIds, deleteItem.id];
    setHiddenIds(next);
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    setDeleteItem(null);
  };

  const openFilterSheet = () => {
    setDraftFilter(filterOption);
    setFilterSheetOpen(true);
  };

  const emptyCopy =
    loadError ||
    (visible.length === 0
      ? 'No quizzes found. Complete a quiz session to see your attempts here.'
      : 'No quizzes found');

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading quiz history...</Text>
      </View>
    );
  }

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <FlatList
        data={filtered}
        keyExtractor={attemptListKey}
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.statsGrid}>
              <StatCard icon="ribbon-outline" label="Total Quizzes" value={String(stats.totalQuizzes)} />
              <StatCard
                icon="trending-up-outline"
                label="Average Score"
                value={`${stats.averageScore.toFixed(1)}%`}
              />
              <StatCard icon="checkmark-circle-outline" label="Best Score" value={`${stats.bestScore}%`} />
              <StatCard icon="calendar-outline" label="Most Recent" value={stats.mostRecent} />
            </View>

            <View style={styles.attemptsCard}>
              <Text style={styles.attemptsHeading}>Quiz Attempts</Text>
              <View style={styles.searchRow}>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={16} color={COLORS.primary} />
                  <TextInput
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    placeholder="Search quizzes..."
                    placeholderTextColor={COLORS.darkTextSecondary}
                    style={styles.searchInput}
                    accessibilityLabel="Search quizzes"
                  />
                </View>
                <Pressable
                  onPress={openFilterSheet}
                  style={({ pressed }) => [styles.filterBtn, pressed && styles.filterBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Filter quizzes">
                  <Ionicons name="options-outline" size={20} color={COLORS.white} />
                </Pressable>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{emptyCopy}</Text>}
        renderItem={({ item }) => {
          const passed = isPassed(item);
          const dateLabel = attemptDateLabel(item);
          const mins = durationMinutes(item);
          const correct = correctAnswersOf(item);
          const total = totalQuestionsOf(item);
          const pct = attemptPercentage(item);
          return (
            <View style={styles.attemptOuter}>
              <Pressable
                onPress={() => setViewItem(item)}
                style={({ pressed }) => [styles.attemptRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`View ${attemptTitle(item)}`}>
                <View style={styles.attemptMain}>
                  <View style={styles.attemptLeft}>
                    <Text style={styles.attemptTitle} numberOfLines={2}>
                      {attemptTitle(item)}
                    </Text>
                    <View style={styles.metaRow}>
                      {dateLabel ? (
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={14} color={COLORS.mutedText} />
                          <Text style={styles.metaText}>{dateLabel}</Text>
                        </View>
                      ) : null}
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={14} color={COLORS.mutedText} />
                        <Text style={styles.metaText}>{mins} min</Text>
                      </View>
                      <Text style={styles.metaText}>
                        {correct}/{total} ({pct}%)
                      </Text>
                    </View>
                  </View>
                  <View style={styles.attemptRight}>
                    <View style={[styles.pill, passed ? styles.pillPass : styles.pillFail]}>
                      <Text style={[styles.pillText, passed ? styles.pillPassText : styles.pillFailText]}>
                        {passed ? 'Passed' : 'Failed'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setDeleteItem(item)}
                      hitSlop={8}
                      style={styles.trashBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Delete attempt">
                      <Ionicons name="trash-outline" size={20} color="#9CA3AF" />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        }}
      />

      <KeyboardAwareBottomSheet
        visible={filterSheetOpen}
        onClose={() => {
          setFilterSheetOpen(false);
          setDraftFilter(filterOption);
        }}
        sheetStyle={styles.filterSheet}
        header={
          <View style={styles.sheetHeader}>
            <View style={styles.grab} />
            <Text style={styles.sheetTitle}>Filter quizzes</Text>
          </View>
        }
        footer={
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={() => {
                setFilterOption(draftFilter);
                setFilterSheetOpen(false);
              }}
              style={({ pressed }) => [styles.applyBtn, pressed && styles.filterBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Apply">
              <Text style={styles.applyLabel}>Apply</Text>
            </Pressable>
          </View>
        }>
        {FILTER_OPTIONS.map((option, index) => {
          const selected = draftFilter === option;
          return (
            <Pressable
              key={option}
              onPress={() => setDraftFilter(option)}
              style={[styles.filterRow, index > 0 && styles.filterRowBorder]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}>
              <Text style={styles.filterRowLabel}>{option}</Text>
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <Ionicons name="checkmark-circle" size={14} color={COLORS.white} /> : null}
              </View>
            </Pressable>
          );
        })}
      </KeyboardAwareBottomSheet>

      <Modal visible={Boolean(viewItem)} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{viewItem?.title || viewItem?.name || 'Quiz'}</Text>
            <Text style={styles.modalMeta}>Score: {viewItem?.percentage ?? viewItem?.score ?? 0}%</Text>
            {viewItem?.submittedAt ? (
              <Text style={styles.modalMeta}>
                Submitted: {new Date(String(viewItem.submittedAt)).toLocaleString()}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.primary} onPress={() => setViewItem(null)}>
              <Text style={styles.primaryLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={Boolean(deleteItem)}
        title="Delete quiz attempt?"
        message="Are you sure you want to delete this quiz attempt?"
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteItem(null)}
        onConfirm={onConfirmDelete}
      />
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    gap: 8,
  },
  loadingText: { color: COLORS.darkTextSecondary, fontSize: 14 },
  list: { paddingHorizontal: SPACING[4], paddingTop: SPACING[4] },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING[3],
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E0F0',
    padding: 12,
    minHeight: 56,
    ...SHADOWS.card,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: { color: '#6B7280', fontSize: 12 },
  statValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 1,
  },
  attemptsCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E0F0',
    borderBottomWidth: 0,
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[3],
    ...SHADOWS.card,
  },
  attemptsHeading: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING[3],
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E8E0F0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 8,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnPressed: { opacity: 0.85 },
  attemptOuter: {
    backgroundColor: COLORS.white,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E0F0',
  },
  attemptRow: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    paddingBottom: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3EEF8',
  },
  pressed: { backgroundColor: COLORS.surfaceMuted },
  attemptMain: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  attemptLeft: {
    flex: 1,
    minWidth: 0,
  },
  attemptRight: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    minHeight: 78,
  },
  attemptTitle: {
    minWidth: 0,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 8,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillPass: { backgroundColor: COLORS.successSoft },
  pillFail: { backgroundColor: COLORS.dangerSoft },
  pillText: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  pillPassText: { color: '#16A34A' },
  pillFailText: { color: '#DC2626' },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: '#6B7280', fontSize: 13 },
  trashBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    color: COLORS.darkTextSecondary,
    paddingVertical: 48,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E0F0',
    borderBottomLeftRadius: RADIUS.md,
    borderBottomRightRadius: RADIUS.md,
  },
  filterSheet: { height: 420 },
  sheetHeader: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  sheetTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  filterRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  filterRowLabel: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  radioOn: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 8 },
  applyBtn: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 16 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING[6],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: SPACING[6],
    gap: SPACING[2],
  },
  modalTitle: { color: COLORS.text, fontWeight: FONT_WEIGHTS.bold, fontSize: 16 },
  modalMeta: { color: COLORS.darkTextSecondary, marginTop: 4, fontSize: 13 },
  primary: {
    marginTop: SPACING[3],
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
});
