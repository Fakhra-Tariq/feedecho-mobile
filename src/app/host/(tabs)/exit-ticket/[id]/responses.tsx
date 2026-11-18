import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { ExitTicketWordCloudPresent } from '@/components/Host/ExitTicketWordCloudPresent';
import { showToast } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import {
  clearExitTicketResponses,
  getExitTicketById,
  getExitTicketResponses,
  normalizeExitResponsesPayload,
  questionsForTicket,
  type ExitResponse,
  type ExitTicket,
} from '@/lib/hostExitTickets';
import { useRtdbList } from '@/lib/useRtdb';
import { buildCloudItemsForQuestion } from '@/utils/wordCloud';

export default function ExitTicketResponsesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = String(id || '');
  const [ticket, setTicket] = useState<ExitTicket | null>(null);
  const [apiResponses, setApiResponses] = useState<ExitResponse[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  const [showAttendanceNames, setShowAttendanceNames] = useState(false);
  const [presentingCloud, setPresentingCloud] = useState(false);
  const [shortTextMode, setShortTextMode] = useState<'words' | 'phrases'>('words');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { width: windowWidth, fontScale } = useWindowDimensions();

  const { list: liveResponses } = useRtdbList(
    ticketId ? `exit_responses/${ticketId}` : null,
    {
      enabled: Boolean(ticketId),
      sort: (a, b) =>
        String(a.submittedAt || a.createdAt || '').localeCompare(
          String(b.submittedAt || b.createdAt || '')
        ),
    }
  );

  const liveList = Array.isArray(liveResponses) ? liveResponses : [];
  const apiList = Array.isArray(apiResponses)
    ? apiResponses
    : normalizeExitResponsesPayload(apiResponses);
  const responses: ExitResponse[] = liveList.length > 0 ? liveList : apiList;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, r] = await Promise.all([
          getExitTicketById(ticketId),
          getExitTicketResponses(ticketId),
        ]);
        if (cancelled) return;
        setTicket(t);
        setApiResponses(r);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load responses');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const questions = useMemo(() => {
    if (!ticket) return [];
    const fromTicket = Array.isArray(ticket.questions)
      ? ticket.questions.filter(Boolean)
      : questionsForTicket(
          ticket.questions ? { [ticket.id]: ticket.questions } : null,
          ticket.id,
          []
        );
    return fromTicket;
  }, [ticket]);

  const questionCount = Math.max(
    questions.length,
    Array.isArray(responses[0]?.answers) ? responses[0].answers.length : 0
  );

  const answersForQuestion = useMemo(() => {
    return responses
      .map((response) => {
        const raw = response?.answers;
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === 'object'
            ? Object.keys(raw)
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => (raw as Record<string, { questionIndex?: number; answer?: string }>)[k])
            : [];
        const entry =
          list.find((a) => a?.questionIndex === selectedQuestion) || list[selectedQuestion];
        return entry?.answer ? String(entry.answer) : null;
      })
      .filter(Boolean) as string[];
  }, [responses, selectedQuestion]);

  const canReveal = answersForQuestion.length >= 2;
  const attendanceNames = useMemo(
    () =>
      [...responses].sort((a, b) =>
        String(a.studentName || '').localeCompare(String(b.studentName || ''))
      ),
    [responses]
  );

  const close = () => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
      return;
    }
    router.back();
  };

  const stackHeaderActions = windowWidth < 340 || fontScale > 1.2;
  const compactLabels = windowWidth < 360 || fontScale > 1.1;
  const canClear = responses.length > 0 && !clearing && !loading;

  const runClearResponses = async () => {
    if (!ticketId || clearing) return;
    setClearing(true);
    try {
      await clearExitTicketResponses(ticketId);
      setApiResponses([]);
      setShowAttendanceNames(false);
      showToast({ type: 'success', title: 'Responses cleared' });
    } catch (err) {
      showToast({
        type: 'info',
        title: 'Failed to clear responses',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setClearing(false);
    }
  };

  const onPressClear = () => {
    if (!canClear) return;
    Alert.alert(
      'Clear all responses?',
      'This will delete all responses for this exit ticket. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void runClearResponses() },
      ]
    );
  };

  const audienceLabel =
    responses.length === 1 ? '1 audience member' : `${responses.length} audience members`;

  const activeQuestion = questions[selectedQuestion];
  const cloudData = useMemo(
    () =>
      buildCloudItemsForQuestion(
        responses,
        selectedQuestion,
        activeQuestion || { type: 'short_text' },
        shortTextMode
      ),
    [responses, selectedQuestion, activeQuestion, shortTextMode]
  );

  return (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.titleRow}>
              <Ionicons name="bar-chart-outline" size={20} color="#6B3A5C" />
              <Text style={styles.title}>Feedback Summary</Text>
            </View>
            <Pressable
              onPress={close}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Ionicons name="close" size={20} color="#5F5460" />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Anonymous responses from {audienceLabel}</Text>
          {!loading && ticket ? (
            <View style={[styles.headerActions, stackHeaderActions && styles.headerActionsStack]}>
              <Pressable
                onPress={() => setPresentingCloud(true)}
                style={({ pressed }) => [
                  styles.headerBtn,
                  styles.wordCloudBtn,
                  compactLabels && styles.headerBtnCompact,
                  pressed && styles.wordCloudBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Word Cloud"
                accessibilityState={{ disabled: false }}>
                <Ionicons name="cloud-outline" size={16} color="#4A1F3D" />
                <Text
                  style={[styles.wordCloudLabel, compactLabels && styles.headerLabelCompact]}
                  numberOfLines={1}>
                  Word Cloud
                </Text>
              </Pressable>
              <Pressable
                onPress={onPressClear}
                disabled={!canClear}
                style={({ pressed }) => [
                  styles.headerBtn,
                  styles.clearBtn,
                  compactLabels && styles.headerBtnCompact,
                  !canClear && styles.clearBtnDisabled,
                  canClear && pressed && styles.clearBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Clear Responses"
                accessibilityState={{ disabled: !canClear }}>
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
                <Text
                  style={[styles.clearLabel, compactLabels && styles.headerLabelCompact]}
                  numberOfLines={1}>
                  Clear Responses
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <View style={styles.hairline} />

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.muted}>Loading feedback...</Text>
          </View>
        ) : error || !ticket ? (
          <View style={styles.centered}>
            <Text style={styles.error}>{error || 'Exit ticket not found'}</Text>
          </View>
        ) : responses.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No responses yet</Text>
            <Text style={styles.muted}>Audience members haven't submitted any feedback.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabsWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsRow}>
                {Array.from({ length: questionCount }, (_, index) => {
                  const on = selectedQuestion === index;
                  return (
                    <Pressable
                      key={index}
                      onPress={() => setSelectedQuestion(index)}
                      style={[styles.tab, on && styles.tabOn]}
                      accessibilityRole="tab"
                      accessibilityLabel={`Question ${index + 1}`}
                      accessibilityState={{ selected: on }}>
                      <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>Q{index + 1}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.hairline} />

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator>
              <View>
                <Text style={styles.questionHeading}>Question {selectedQuestion + 1}</Text>
                {questions[selectedQuestion]?.prompt ? (
                  <Text style={styles.questionPrompt}>
                    {questions[selectedQuestion]?.prompt}
                  </Text>
                ) : null}
              </View>

              <View style={styles.responsesCard}>
                <Text style={styles.sectionTitle}>Individual Responses</Text>
                {!canReveal ? (
                  <Text style={styles.privacyText}>
                    At least 2 responses are required before answers are shown (anonymity).
                  </Text>
                ) : answersForQuestion.length === 0 ? (
                  <Text style={styles.muted}>No responses yet.</Text>
                ) : (
                  answersForQuestion.map((answer, index) => (
                    <View key={`${answer}-${index}`} style={styles.answerRow}>
                      <Text style={styles.answerText}>{answer}</Text>
                    </View>
                  ))
                )}
              </View>

              <Text style={styles.summaryHeading}>Summary</Text>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Responses</Text>
                <Text style={styles.statValue}>{responses.length}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Response Rate</Text>
                <Text style={styles.statValue}>100%</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Attendance Marked</Text>
                <View style={styles.attendanceRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#6B3A5C" />
                  <Text style={styles.attendanceCount}>{audienceLabel}</Text>
                  <Pressable
                    onPress={() => setShowAttendanceNames((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={styles.showPill}
                    accessibilityRole="button"
                    accessibilityLabel="Show attendance names">
                    <Text style={styles.showPillText}>
                      {showAttendanceNames ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
                {showAttendanceNames
                  ? attendanceNames.map((row, index) => (
                      <View
                        key={row.id || `${row.studentName}-${index}`}
                        style={[styles.nameRow, index > 0 && styles.nameRowBorder]}>
                        <Text style={styles.nameText}>
                          {row.studentName || 'Anonymous Audience'}
                        </Text>
                      </View>
                    ))
                  : null}
              </View>
            </ScrollView>
          </>
        )}
      </View>
      <ExitTicketWordCloudPresent
        open={presentingCloud}
        onClose={() => setPresentingCloud(false)}
        questionIndex={selectedQuestion}
        questionCount={Math.max(questionCount, 1)}
        onPrev={() =>
          setSelectedQuestion((prev) => (prev - 1 + Math.max(questionCount, 1)) % Math.max(questionCount, 1))
        }
        onNext={() =>
          setSelectedQuestion((prev) => (prev + 1) % Math.max(questionCount, 1))
        }
        question={activeQuestion}
        items={cloudData.items}
        extra={cloudData.extra}
        responseCount={responses.length}
        shortTextMode={shortTextMode}
        onShortTextModeChange={setShortTextMode}
        seedKey={`${ticketId}:${selectedQuestion}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: { padding: 16 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  title: {
    flex: 1,
    color: '#2B1F27',
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { color: '#5F5460', fontSize: 12, marginTop: 4 },
  headerActions: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  headerActionsStack: {
    flexDirection: 'column',
  },
  headerBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  headerBtnCompact: {
    paddingHorizontal: 6,
  },
  wordCloudBtn: {
    borderColor: '#6B3A5C',
    backgroundColor: '#FFFFFF',
  },
  wordCloudBtnPressed: { backgroundColor: '#E6D2DF' },
  wordCloudLabel: {
    flexShrink: 1,
    color: '#4A1F3D',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  headerLabelCompact: {
    fontSize: 12,
  },
  clearBtn: {
    borderColor: '#6B3A5C',
    backgroundColor: '#6B3A5C',
  },
  clearBtnPressed: { backgroundColor: '#5A2D4C' },
  clearBtnDisabled: { opacity: 0.5 },
  clearLabel: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  hairline: { height: 1, backgroundColor: '#EFE7EC' },
  centered: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  error: { color: COLORS.dangerText, textAlign: 'center' },
  emptyTitle: {
    color: '#2B1F27',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  muted: { color: '#5F5460', fontSize: 13, textAlign: 'center' },
  tabsWrap: { height: 44 },
  tabsScroll: { flexGrow: 0, height: 44 },
  tabsRow: { height: 44, alignItems: 'center', paddingHorizontal: 8 },
  tab: {
    height: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    flexShrink: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: '#6B3A5C' },
  tabLabel: { color: '#5F5460', fontSize: 14, fontWeight: FONT_WEIGHTS.medium },
  tabLabelOn: { color: '#6B3A5C', fontWeight: FONT_WEIGHTS.semibold },
  body: { flexShrink: 1, maxHeight: '70%' },
  bodyContent: { padding: 16, gap: 14, paddingBottom: 24 },
  questionHeading: { color: '#2B1F27', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  questionPrompt: { color: '#5F5460', fontSize: 13, marginTop: 4 },
  responsesCard: {
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
  },
  sectionTitle: {
    color: '#2B1F27',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  privacyText: { color: '#5F5460', fontSize: 13, marginTop: 8, lineHeight: 18 },
  answerRow: {
    marginTop: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#ECE3EA',
    borderRadius: 10,
    padding: 12,
  },
  answerText: { color: '#2B1F27', fontSize: 13 },
  summaryHeading: { color: '#2B1F27', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  statCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
  },
  statLabel: { color: '#5F5460', fontSize: 13 },
  statValue: {
    color: '#6B3A5C',
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 4,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  attendanceCount: { flex: 1, color: '#2B1F27', fontSize: 13 },
  showPill: {
    backgroundColor: '#F1EDF0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  showPillText: { color: '#2B1F27', fontSize: 12, fontWeight: FONT_WEIGHTS.medium },
  nameRow: { paddingVertical: 10 },
  nameRowBorder: { borderTopWidth: 1, borderTopColor: '#EFE7EC' },
  nameText: { color: '#2B1F27', fontSize: 13 },
});
