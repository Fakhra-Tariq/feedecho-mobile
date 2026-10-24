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
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { formatSessionDate } from '@/lib/formatLocalDateTime';
import {
  activityBadge,
  getStudentActivity,
  localQuizActivityItems,
  mergeActivityItems,
  studentQueryFromProfile,
  type ActivityItem,
} from '@/lib/studentsActivity';

const HIDDEN_KEY = 'audienceHiddenActivityIds';

function activityIso(item: ActivityItem | null | undefined) {
  if (!item) return '';
  if (item.type === 'spaceRace') {
    return String(item.joinedAt || item.sessionDate || item.sortKey || '');
  }
  if (item.type === 'exitTicket') {
    return String(item.submittedAt || item.createdAt || item.sortKey || '');
  }
  return String(item.submittedAt || item.sortKey || item.timestamp || '');
}

function getActivityDisplayTimes(item: ActivityItem | null | undefined) {
  const parts = formatSessionDate(activityIso(item));
  return {
    date: parts.date,
    time: parts.time,
    joinedDate: parts.date,
    joinedTime: parts.time,
  };
}

function activitySubtitle(item: ActivityItem) {
  if (item.score) return `Score: ${item.score}`;
  if (item.rank) return `Rank: ${item.rank}`;
  return String(item.subtitle || '');
}

function tagColors(type?: string) {
  if (type === 'quiz') return { bg: '#ede9fc', fg: '#5340b0' };
  if (type === 'exitTicket') return { bg: '#fef3c7', fg: '#92400e' };
  return { bg: '#e1f5ee', fg: '#0f6e56' };
}

export default function AudienceProgressScreen() {
  const { profile, user, loading: authLoading } = useAuth();
  const isGuest = Boolean(profile?.guest) || !String(user?.uid || profile?.uid || '').trim();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewItem, setViewItem] = useState<ActivityItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ActivityItem | null>(null);
  const hasLoadedRef = useRef(false);

  const loadActivity = useCallback(async () => {
    if (authLoading) return;
    if (isGuest) {
      setItems([]);
      setLoadError('');
      setLoading(false);
      return;
    }
    const query = studentQueryFromProfile(profile, user);
    if (!query.uid) {
      setItems([]);
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
        getStudentActivity({ ...query, limit: 200 }),
        localQuizActivityItems(query),
      ]);
      setItems(mergeActivityItems(server, local));
      hasLoadedRef.current = true;
    } catch (err) {
      setItems([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [authLoading, isGuest, profile, user]);

  useFocusEffect(
    useCallback(() => {
      void loadActivity();
    }, [loadActivity])
  );

  const visible = useMemo(
    () => items.filter((item) => !hiddenIds.includes(item.id)),
    [items, hiddenIds]
  );

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

  const shownModal = getActivityDisplayTimes(viewItem);

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Your Progress</Text>
              <Text style={styles.bannerHint}>
                Track quizzes, space races, and exit tickets — updated live.
              </Text>
            </View>
            <Text style={styles.section}>ACTIVITY HISTORY</Text>
          </View>
        }
        ListEmptyComponent={
          loadError ? (
            <View style={styles.card}>
              <Text style={styles.title}>Couldn’t load activity</Text>
              <Text style={styles.meta}>{loadError}</Text>
            </View>
          ) : (
            <Text style={styles.empty}>No activity recorded yet.</Text>
          )
        }
        renderItem={({ item }) => {
          const shown = getActivityDisplayTimes(item);
          const colors = tagColors(item.type);
          const iconName =
            item.type === 'quiz'
              ? ('pencil-outline' as const)
              : item.type === 'exitTicket'
                ? ('document-text-outline' as const)
                : ('rocket-outline' as const);
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title || 'Activity'}</Text>
              <Text style={styles.meta}>
                {shown.date} · {shown.time}
              </Text>
              {activitySubtitle(item) ? (
                <Text style={styles.meta}>{activitySubtitle(item)}</Text>
              ) : null}
              <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                <Ionicons name={iconName} size={12} color={colors.fg} />
                <Text style={[styles.badgeText, { color: colors.fg }]}>{activityBadge(item)}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.viewBtn} onPress={() => setViewItem(item)}>
                  <Text style={styles.viewLabel}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteItem(item)}>
                  <Text style={styles.deleteLabel}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />

      <Modal visible={Boolean(viewItem)} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setViewItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {viewItem?.type === 'quiz'
                  ? 'Quiz Details'
                  : viewItem?.type === 'exitTicket'
                    ? 'Exit Ticket Details'
                    : 'Space Race Details'}
              </Text>
              <Pressable onPress={() => setViewItem(null)} hitSlop={8} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#9CA3AF" />
              </Pressable>
            </View>
            <Text style={styles.title}>{viewItem?.title || 'Activity'}</Text>
            <Text style={styles.meta}>Date: {shownModal.date}</Text>
            <Text style={styles.meta}>Time: {shownModal.time}</Text>
            {viewItem?.type === 'spaceRace' ? (
              <>
                <Text style={styles.meta}>Team: {String(viewItem.rank || viewItem.subtitle || '')}</Text>
                {viewItem.score ? <Text style={styles.meta}>Score: {String(viewItem.score)}</Text> : null}
                <Text style={styles.meta}>
                  Joined: {shownModal.joinedDate} · {shownModal.joinedTime}
                </Text>
              </>
            ) : null}
            {viewItem?.type === 'quiz' && viewItem.score != null ? (
              <Text style={styles.meta}>Score: {String(viewItem.score)}</Text>
            ) : null}
            {viewItem?.type === 'exitTicket' ? (
              <Text style={styles.meta}>
                Submitted: {shownModal.date} · {shownModal.time}
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(deleteItem)} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setDeleteItem(null)}>
          <Pressable style={styles.deleteCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteTitle}>Delete Entry?</Text>
            <Text style={styles.deleteBody}>Are you sure you want to delete this entry?</Text>
            <View style={styles.deleteRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setDeleteItem(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={onConfirmDelete}>
                <Text style={styles.confirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING[4], paddingBottom: SPACING[12] },
  banner: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING[6],
    marginTop: SPACING[4],
    marginBottom: SPACING[4],
  },
  bannerTitle: { color: COLORS.white, fontSize: 28, fontWeight: FONT_WEIGHTS.bold, marginBottom: 8 },
  bannerHint: { color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 22 },
  section: {
    fontSize: 12,
    letterSpacing: 0.08 * 12,
    textTransform: 'uppercase',
    color: '#6B7280',
    marginBottom: SPACING[3],
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: FONT_WEIGHTS.medium, color: '#1a1a1a', marginBottom: 4 },
  meta: { fontSize: 14, color: '#4B5563', marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  actions: { flexDirection: 'row', gap: 8, marginTop: SPACING[3] },
  viewBtn: {
    backgroundColor: '#7c3f5e',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  viewLabel: { color: COLORS.white, fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  deleteBtn: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#c0392b',
    backgroundColor: 'transparent',
  },
  deleteLabel: { color: '#c0392b', fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  empty: { textAlign: 'center', color: '#6B7280', paddingVertical: 48 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: SPACING[4],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: FONT_WEIGHTS.bold, color: '#7c3f5e', flex: 1 },
  deleteCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: '#1a1a1a', marginBottom: 8 },
  deleteBody: { fontSize: 14, color: '#4B5563', marginBottom: 24 },
  deleteRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: '#374151', fontWeight: FONT_WEIGHTS.medium, fontSize: 14 },
  confirmBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: COLORS.white, fontWeight: FONT_WEIGHTS.medium, fontSize: 14 },
});
