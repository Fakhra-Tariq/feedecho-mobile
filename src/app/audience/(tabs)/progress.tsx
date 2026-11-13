import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmModal } from '@/components/ConfirmModal';
import { showAlert, showToast } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { formatSessionDate } from '@/lib/formatLocalDateTime';
import {
  extractSubmissionAnswer,
  reviewQuestionAnswer,
} from '@/lib/scoringUtils';
import {
  activityBadge,
  activityLine,
  type ActivityItem,
} from '@/lib/studentsActivity';
import {
  resolveExitTicketActivityTitle,
  useExitTicketActivityTitles,
} from '@/lib/useExitTicketActivityTitles';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { useStudentActivity } from '@/lib/useStudentActivity';

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

function cleanText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null' || text === '—') return '';
  return text;
}

function formatAnswerDisplay(value: unknown) {
  if (value == null || value === '') return '—';
  if (value === true) return 'True';
  if (value === false) return 'False';
  const text = String(value).trim();
  if (text.toLowerCase() === 'true') return 'True';
  if (text.toLowerCase() === 'false') return 'False';
  return text;
}

function formatDuration(seconds: unknown) {
  if (seconds == null || seconds === '' || Number.isNaN(Number(seconds))) return '';
  const total = Math.max(0, Math.round(Number(seconds)));
  if (total === 0) return '0s';
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function quizQuestions(item: ActivityItem | null) {
  const questions = item?.questions;
  if (Array.isArray(questions) && questions.length) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions as object)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => (questions as Record<string, unknown>)[k])
      .filter(Boolean);
  }
  const answers = item?.answers;
  if (answers && typeof answers === 'object') {
    return Object.keys(answers as object).map((k, i) => ({
      id: k,
      questionText: `Question ${i + 1}`,
    }));
  }
  return [];
}

function tagColors(type?: string) {
  if (type === 'quiz') return { bg: '#ede9fc', fg: '#5340b0' };
  if (type === 'exitTicket') return { bg: '#fef3c7', fg: '#92400e' };
  return { bg: '#e1f5ee', fg: '#0f6e56' };
}

function quizScorePercent(item: ActivityItem) {
  const raw = item.percentage ?? item.score;
  if (raw == null || raw === '') return '';
  const n = String(raw).replace(/%/g, '').trim();
  if (!n || n === 'undefined' || n === 'null') return '';
  return n;
}

export default function AudienceProgressScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { items: activityItems, loading, error, hideActivity } = useStudentActivity(200);
  const items = activityItems.filter(
    (item) => item.type !== 'liveChat' && item.type !== 'anonymousChat'
  );
  const exitTicketTitles = useExitTicketActivityTitles(items);
  const [viewItem, setViewItem] = useState<ActivityItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<ActivityItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const shownModal = getActivityDisplayTimes(viewItem);
  const stackButtons = width < 380;
  const listPadBottom = TAB_BAR_CONTENT_HEIGHT + insets.bottom + 16;

  const onConfirmDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await hideActivity(deleteItem.id);
      setDeleteItem(null);
      showToast({ title: 'Deleted', type: 'success' });
    } catch {
      showAlert({
        type: 'error',
        title: 'Couldn’t delete',
        message: 'Couldn’t remove this activity. Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
        ListHeaderComponent={
          <View>
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>Your Progress</Text>
              <Text style={styles.bannerHint}>
                Track quizzes, space races, and exit tickets — updated live.
              </Text>
            </View>
            <Text style={styles.section}>ACTIVITY HISTORY</Text>
            {loading && items.length === 0 ? (
              <ActivityIndicator color={COLORS.primary} style={styles.loader} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : error ? (
            <Text style={styles.empty}>{error}</Text>
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
          const title =
            item.type === 'exitTicket'
              ? resolveExitTicketActivityTitle(item, exitTicketTitles)
              : cleanText(item.title) || 'Activity';
          const when =
            cleanText(shown.date) && cleanText(shown.time)
              ? `${shown.date} · ${shown.time}`
              : cleanText(shown.date) || cleanText(shown.time);
          const detail = activityLine(item);
          return (
            <View style={styles.card}>
              <View style={[styles.cardRow, stackButtons && styles.cardWrap]}>
                <View style={styles.cardCopy}>
                  <Text style={styles.title} numberOfLines={2}>
                    {title}
                  </Text>
                  {when ? <Text style={styles.meta}>{when}</Text> : null}
                  {detail ? <Text style={styles.meta}>{detail}</Text> : null}
                  <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                    <Ionicons name={iconName} size={12} color={colors.fg} />
                    <Text style={[styles.badgeText, { color: colors.fg }]}>
                      {activityBadge(item)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.actions, stackButtons && styles.actionsRow]}>
                  <Pressable
                    style={styles.viewBtn}
                    onPress={() => setViewItem(item)}
                    hitSlop={6}
                    accessibilityLabel="View details">
                    <Text style={styles.viewLabel}>View</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => setDeleteItem(item)}
                    hitSlop={6}
                    accessibilityLabel="Delete activity">
                    <Text style={styles.deleteLabel}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={Boolean(viewItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setViewItem(null)}>
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
              <Pressable
                onPress={() => setViewItem(null)}
                style={styles.closeHit}
                accessibilityLabel="Close">
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {viewItem?.type === 'exitTicket' ? (
                <Text style={styles.modalHeading}>
                  {resolveExitTicketActivityTitle(viewItem, exitTicketTitles)}
                </Text>
              ) : cleanText(viewItem?.title) ? (
                <Text style={styles.modalHeading}>{cleanText(viewItem?.title)}</Text>
              ) : null}
              {cleanText(shownModal.date) ? (
                <Text style={styles.modalMeta}>Date: {shownModal.date}</Text>
              ) : null}
              {cleanText(shownModal.time) ? (
                <Text style={styles.modalMeta}>Time: {shownModal.time}</Text>
              ) : null}
              {viewItem?.type === 'quiz' ? (
                <>
                  {quizScorePercent(viewItem) ? (
                    <Text style={styles.modalMeta}>Score: {quizScorePercent(viewItem)}%</Text>
                  ) : null}
                  <View style={styles.statsBox}>
                    <Text style={styles.statsLead}>
                      Total questions:{' '}
                      {Number(viewItem.totalQuestions ?? quizQuestions(viewItem).length ?? 0)}
                    </Text>
                    <Text style={styles.modalMeta}>
                      Correct answers:{' '}
                      {String(viewItem.correctAnswers ?? (typeof viewItem.score === 'number' ? viewItem.score : 0))}
                    </Text>
                    {formatDuration(viewItem.timeTaken) ? (
                      <Text style={styles.modalMeta}>
                        Time taken: {formatDuration(viewItem.timeTaken)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.modalDivider} />
                  <Text style={styles.breakdownTitle}>Question breakdown:</Text>
                  {quizQuestions(viewItem).length ? (
                    quizQuestions(viewItem).map((question: any, index: number) => {
                      const studentAnswerRaw = extractSubmissionAnswer(
                        viewItem.answers,
                        index,
                        question
                      );
                      const studentAnswer = formatAnswerDisplay(studentAnswerRaw);
                      const questionType = question.type || viewItem.quizType;
                      const totalQs =
                        Number(viewItem.totalQuestions) || quizQuestions(viewItem).length || 0;
                      const { isCorrect } = reviewQuestionAnswer(
                        question,
                        studentAnswerRaw,
                        questionType,
                        totalQs
                      );
                      const prompt = cleanText(
                        question.questionText || question.text || question.prompt
                      );
                      return (
                        <View key={String(question.id || index)} style={styles.breakdownRow}>
                          <Text style={styles.breakdownQ}>
                            Q{index + 1}: {prompt || 'Question'}
                          </Text>
                          <View style={styles.breakdownAns}>
                            <Ionicons
                              name={isCorrect ? 'checkmark' : 'close'}
                              size={16}
                              color={isCorrect ? '#16A34A' : '#DC2626'}
                            />
                            <Text style={styles.modalMeta}>{studentAnswer}</Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.modalMeta}>
                      No question details available for this attempt.
                    </Text>
                  )}
                </>
              ) : null}
              {viewItem?.type === 'spaceRace' ? (
                <>
                  {cleanText(viewItem.rank || viewItem.subtitle) ? (
                    <Text style={styles.modalMeta}>
                      Team: {cleanText(viewItem.rank || viewItem.subtitle)}
                    </Text>
                  ) : null}
                  {cleanText(viewItem.score) ? (
                    <Text style={styles.modalMeta}>Score: {cleanText(viewItem.score)}</Text>
                  ) : null}
                  {cleanText(shownModal.joinedDate) && cleanText(shownModal.joinedTime) ? (
                    <Text style={styles.modalMeta}>
                      Joined: {shownModal.joinedDate} · {shownModal.joinedTime}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {viewItem?.type === 'exitTicket' ? (
                <>
                  <Text style={styles.modalMeta}>Submitted exit ticket</Text>
                  {cleanText(shownModal.date) && cleanText(shownModal.time) ? (
                    <Text style={styles.modalMeta}>
                      Submitted: {shownModal.date} · {shownModal.time}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={Boolean(deleteItem)}
        title="Delete Entry?"
        message="Are you sure you want to delete this entry?"
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => {
          void onConfirmDelete();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  list: { paddingHorizontal: 16 },
  banner: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  bannerTitle: { color: COLORS.white, fontSize: 28, fontWeight: FONT_WEIGHTS.bold, marginBottom: 8 },
  bannerHint: { color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 22 },
  section: {
    fontSize: 12,
    letterSpacing: 0.08 * 12,
    textTransform: 'uppercase',
    color: '#6B7280',
    marginBottom: 12,
  },
  loader: { marginVertical: 24 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardWrap: { flexWrap: 'wrap' },
  cardCopy: { flex: 1, minWidth: 160 },
  title: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    marginBottom: 4,
  },
  meta: { fontSize: 12, color: '#5F5460', marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  actionsRow: { marginLeft: 0, marginTop: 8, width: '100%' },
  viewBtn: {
    backgroundColor: '#6B3A5C',
    borderRadius: 10,
    height: 32,
    minWidth: 72,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewLabel: { color: COLORS.white, fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  deleteBtn: {
    borderRadius: 10,
    height: 32,
    minWidth: 72,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F5B5B0',
    backgroundColor: COLORS.white,
  },
  deleteLabel: { color: '#B3261E', fontSize: 12, fontWeight: FONT_WEIGHTS.semibold },
  empty: { textAlign: 'center', color: '#5F5460', fontSize: 13, paddingVertical: 48 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    width: '90%',
    maxWidth: 420,
    maxHeight: '85%',
  },
  modalScroll: { maxHeight: 520 },
  statsBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F7F8FA',
  },
  statsLead: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#6B3A5C',
    marginBottom: 4,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#6B3A5C',
    marginBottom: 12,
  },
  breakdownRow: { marginBottom: 12 },
  breakdownQ: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    marginBottom: 4,
  },
  breakdownAns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.semibold, color: '#6B3A5C', flex: 1 },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalHeading: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    marginBottom: 8,
  },
  modalMeta: { fontSize: 13, color: '#5F5460', marginBottom: 4 },
});
