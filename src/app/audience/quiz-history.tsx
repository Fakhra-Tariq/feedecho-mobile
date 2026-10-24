import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ConfirmModal } from '@/components/ConfirmModal';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  getStudentQuizHistory,
  localQuizHistoryRows,
  mergeQuizHistoryRows,
  studentQueryFromProfile,
  type QuizHistoryRow,
} from '@/lib/studentsActivity';

const HIDDEN_KEY = 'quizHistoryHiddenIds';

export default function AudienceQuizHistoryScreen() {
  const { profile, user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<QuizHistoryRow[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewItem, setViewItem] = useState<QuizHistoryRow | null>(null);
  const [deleteItem, setDeleteItem] = useState<QuizHistoryRow | null>(null);
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
    const total = visible.length;
    const avg =
      total === 0
        ? 0
        : Math.round(
            visible.reduce((sum, row) => sum + Number(row.percentage ?? row.score ?? 0), 0) / total
          );
    const best = visible.reduce(
      (max, row) => Math.max(max, Number(row.percentage ?? row.score ?? 0)),
      0
    );
    return { total, avg, best };
  }, [visible]);

  const onConfirmDelete = async () => {
    if (!deleteItem) return;
    const next = [...hiddenIds, deleteItem.id];
    setHiddenIds(next);
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    setDeleteItem(null);
  };

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.stats}>
        {[
          ['Total', stats.total],
          ['Average', `${stats.avg}%`],
          ['Best', `${stats.best}%`],
        ].map(([label, value]) => (
          <View key={String(label)} style={styles.stat}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loadError ? loadError : 'No quiz attempts yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title || item.name || 'Quiz'}</Text>
            <Text style={styles.meta}>
              Score {item.percentage ?? item.score ?? 0}%
              {item.passed != null ? (item.passed ? ' · Passed' : ' · Failed') : ''}
            </Text>
            {item.submittedAt ? (
              <Text style={styles.meta}>{new Date(item.submittedAt).toLocaleString()}</Text>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.action} onPress={() => setViewItem(item)}>
                <Text style={styles.actionLabel}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.danger} onPress={() => setDeleteItem(item)}>
                <Text style={styles.dangerLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <Modal visible={Boolean(viewItem)} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>{viewItem?.title || viewItem?.name || 'Quiz'}</Text>
            <Text style={styles.meta}>Score: {viewItem?.percentage ?? viewItem?.score ?? 0}%</Text>
            {viewItem?.submittedAt ? (
              <Text style={styles.meta}>
                Submitted: {new Date(viewItem.submittedAt).toLocaleString()}
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
        title="Hide quiz attempt?"
        message="This only hides the attempt on this device. It does not delete server records."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteItem(null)}
        onConfirm={onConfirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: SPACING[2], padding: SPACING[4] },
  stat: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING[3],
    alignItems: 'center',
  },
  statValue: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.bold, fontSize: 18 },
  statLabel: { color: COLORS.darkTextSecondary, fontSize: 11, marginTop: 2 },
  list: { paddingHorizontal: SPACING[4], paddingBottom: SPACING[12] },
  empty: { textAlign: 'center', color: COLORS.darkTextSecondary, marginTop: SPACING[8] },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
    marginBottom: SPACING[3],
  },
  title: { color: COLORS.text, fontWeight: FONT_WEIGHTS.bold, fontSize: 16 },
  meta: { color: COLORS.darkTextSecondary, marginTop: 4, fontSize: 13 },
  actions: { flexDirection: 'row', gap: SPACING[2], marginTop: SPACING[3] },
  action: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 40,
    paddingHorizontal: SPACING[3],
    justifyContent: 'center',
  },
  actionLabel: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium },
  danger: {
    borderRadius: 10,
    backgroundColor: COLORS.dangerSoft,
    minHeight: 40,
    paddingHorizontal: SPACING[3],
    justifyContent: 'center',
  },
  dangerLabel: { color: COLORS.dangerText, fontWeight: FONT_WEIGHTS.semibold },
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
