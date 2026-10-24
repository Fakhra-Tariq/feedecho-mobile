import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { equalTo, off, onValue, orderByChild, query, ref as dbRef } from 'firebase/database';

import { ConfirmModal } from '@/components/ConfirmModal';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { db } from '../../../firebaseConfig';
import { apiRequest } from '@/lib/api';
import { normalizeQuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import {
  buildLaunchHistory,
  collectReportDataForQuiz,
  isSubmittedRow,
  normalizeTimeTakenSeconds,
} from '@/lib/hostQuizReports';
import {
  extractSubmissionAnswer,
  getCorrectOptionIndex,
  normalizeQuestionsForScoring,
  reviewQuestionAnswer,
} from '@/lib/scoringUtils';
import { useQuizSubmissionListeners } from '@/lib/useQuizSubmissionListeners';

const PASS_THRESHOLD = 60;

const normalizeListStatus = (status: unknown) => {
  let normalizedStatus: any = status;
  if (normalizedStatus === null || normalizedStatus === undefined) {
    normalizedStatus = 'draft';
  }
  if (typeof normalizedStatus === 'string') {
    normalizedStatus = normalizedStatus.toLowerCase();
  }
  return normalizedStatus;
};

const getQuizLaunchSortKey = (quiz: any) =>
  String(
    quiz?.launchSettings?.launchedAt ||
      quiz?.launchedAt ||
      quiz?.publishedAt ||
      quiz?.createdAt ||
      quiz?.updatedAt ||
      ''
  );

const compareQuizzesByLaunchDesc = (a: any, b: any) =>
  getQuizLaunchSortKey(b).localeCompare(getQuizLaunchSortKey(a));

const normalizeQuestionsList = (questions: any) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

const formatAnswerDisplay = (value: any) => {
  if (value == null || value === '') return 'No answer';
  if (value === true) return 'True';
  if (value === false) return 'False';
  const text = String(value).trim();
  if (text.toLowerCase() === 'true') return 'True';
  if (text.toLowerCase() === 'false') return 'False';
  return text;
};

const formatDurationForReport = (seconds: any) => {
  if (seconds == null || seconds === '' || Number.isNaN(Number(seconds))) return null;
  const total = Math.max(1, Math.round(Number(seconds)));
  const mins = Math.max(1, Math.round(total / 60));
  return `${mins} min`;
};

const formatDate = (iso: any) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getOptionText = (option: any) => {
  if (option == null) return '';
  return typeof option === 'string' ? option : option?.text || '';
};

const getSelectedOptionIndex = (question: any, studentAnswer: any) => {
  if (studentAnswer == null || studentAnswer === '') return null;
  if (typeof studentAnswer === 'number' && Array.isArray(question?.options)) {
    if (studentAnswer >= 0 && studentAnswer < question.options.length) return studentAnswer;
  }
  const parsedNumeric = Number(studentAnswer);
  if (
    Array.isArray(question?.options) &&
    Number.isInteger(parsedNumeric) &&
    parsedNumeric >= 0 &&
    parsedNumeric < question.options.length &&
    String(studentAnswer).trim() === String(parsedNumeric)
  ) {
    return parsedNumeric;
  }
  const answerText = String(studentAnswer).trim().toLowerCase();
  if (!Array.isArray(question?.options)) {
    return Number.isInteger(parsedNumeric) && !Number.isNaN(parsedNumeric) ? parsedNumeric : null;
  }
  const byText = question.options.findIndex(
    (opt: any) => getOptionText(opt).trim().toLowerCase() === answerText
  );
  if (byText >= 0) return byText;
  if (
    Number.isInteger(parsedNumeric) &&
    parsedNumeric >= 0 &&
    parsedNumeric < question.options.length
  ) {
    return parsedNumeric;
  }
  return null;
};

const enrichSubmission = (submission: any, quiz: any) => ({
  ...submission,
  questions: normalizeQuestionsList(submission?.questions || quiz?.questions),
  quizType: submission?.quizType || quiz?.type || '',
  answers: submission?.answers || {},
});

const loadHostQuizzesFromRtdb = (teacherUid: string, { includeDeleted = false } = {}) =>
  new Promise<any[]>((resolve) => {
    if (!teacherUid) {
      resolve([]);
      return;
    }
    const quizzesQuery = query(dbRef(db, 'quizzes'), orderByChild('createdBy'), equalTo(teacherUid));
    let settled = false;
    const finish = (list: any[]) => {
      if (settled) return;
      settled = true;
      try {
        off(quizzesQuery);
      } catch {
        /* listener may already be detached */
      }
      resolve(list);
    };
    onValue(
      quizzesQuery,
      (snap) => {
        if (!snap.exists()) {
          finish([]);
          return;
        }
        const list = Object.entries(snap.val() || {})
          .map(([id, quiz]) => ({ id, ...(quiz as object) }))
          .filter((quiz: any) => {
            if (quiz.deletedAt) return includeDeleted;
            return normalizeListStatus(quiz.status) !== 'ended';
          })
          .sort(compareQuizzesByLaunchDesc);
        finish(list);
      },
      () => finish([])
    );
  });

type ReportView = 'launches' | 'participants' | 'detail' | null;

export default function HostReportsScreen() {
  const { profile } = useAuth();
  const teacherUid = profile?.uid || '';

  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [apiFallbackByQuizId, setApiFallbackByQuizId] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [selectedLaunch, setSelectedLaunch] = useState<any>(null);
  const [launchHistory, setLaunchHistory] = useState<any[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [reportModalView, setReportModalView] = useState<ReportView>(null);
  const [loadingReportDetail, setLoadingReportDetail] = useState(false);
  const [deleteConfirmQuizId, setDeleteConfirmQuizId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const quizIds = useMemo(() => quizzes.map((q) => q.id).filter(Boolean), [quizzes]);
  const { submissionsByQuizId, participantsByQuizId, ready: listenersReady } =
    useQuizSubmissionListeners(quizIds, { listenParticipants: true });

  const refreshQuizzes = useCallback(async () => {
    if (!teacherUid) {
      setQuizzes([]);
      setLoadingQuizzes(false);
      return;
    }
    setLoadingQuizzes(true);
    try {
      let list: any[] = [];
      try {
        const response = await apiRequest<{ success?: boolean; data?: any[] }>(
          '/quizzes?includeDeleted=true'
        );
        list = (response.success ? response.data : [])?.slice() || [];
      } catch {
        list = [];
      }
      if (!list.length) {
        list = await loadHostQuizzesFromRtdb(teacherUid, { includeDeleted: true });
      } else {
        list.sort(compareQuizzesByLaunchDesc);
      }
      setQuizzes(list);
      setApiFallbackByQuizId({});
    } finally {
      setLoadingQuizzes(false);
    }
  }, [teacherUid]);

  useEffect(() => {
    refreshQuizzes();
  }, [refreshQuizzes]);

  const quizReports = useMemo(() => {
    if (!quizzes.length) return [];
    return quizzes
      .map((quiz) =>
        collectReportDataForQuiz(
          quiz,
          submissionsByQuizId,
          participantsByQuizId,
          apiFallbackByQuizId,
          { includeDetails: false }
        )
      )
      .filter((report: any) => Number(report.submittedCount) > 0);
  }, [quizzes, submissionsByQuizId, participantsByQuizId, apiFallbackByQuizId]);

  const loading = loadingQuizzes || (quizIds.length > 0 && !listenersReady);

  const overviewStats = useMemo(() => {
    const allSubmissions = quizReports.flatMap((r: any) => r.submissions).filter(isSubmittedRow);
    const totalQuizzes = quizReports.length;
    const totalParticipants = allSubmissions.length;
    const avgScore =
      totalParticipants > 0
        ? Math.round(
            allSubmissions.reduce(
              (sum: number, s: any) => sum + Number(s.percentage || 0),
              0
            ) / totalParticipants
          )
        : 0;
    const passCount = allSubmissions.filter(
      (s: any) => Number(s.percentage || 0) >= PASS_THRESHOLD
    ).length;
    const passRate =
      totalParticipants > 0 ? Math.round((passCount / totalParticipants) * 100) : 0;
    return { totalQuizzes, totalParticipants, avgScore, passRate };
  }, [quizReports]);

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return quizReports;
    return quizReports.filter((r: any) => (r.quiz.title || '').toLowerCase().includes(term));
  }, [quizReports, searchTerm]);

  const closeReportModal = useCallback(() => {
    setSelectedReport(null);
    setSelectedLaunch(null);
    setLaunchHistory([]);
    setSelectedSubmission(null);
    setReportModalView(null);
  }, []);

  const openQuizReport = useCallback(
    async (report: any) => {
      setSelectedReport(report);
      setSelectedLaunch(null);
      setSelectedSubmission(null);
      setLaunchHistory([]);
      setReportModalView('launches');
      setLoadingReportDetail(true);
      try {
        const response = await apiRequest<{ success?: boolean; data?: any }>(
          `/quiz-submissions/${report.quiz.id}/results`
        );
        const data = response?.data;
        if (data) {
          setApiFallbackByQuizId((prev) => {
            const next = { ...prev, [report.quiz.id]: data };
            const refreshed = collectReportDataForQuiz(
              report.quiz,
              submissionsByQuizId,
              participantsByQuizId,
              next,
              { includeDetails: true }
            );
            setSelectedReport(refreshed);
            setLaunchHistory(
              buildLaunchHistory(
                report.quiz,
                refreshed.submissions,
                data.participants || [],
                data.launches || null
              )
            );
            return next;
          });
        } else {
          setLaunchHistory(buildLaunchHistory(report.quiz, report.submissions, [], null));
        }
      } catch {
        setLaunchHistory(buildLaunchHistory(report.quiz, report.submissions, [], null));
      } finally {
        setLoadingReportDetail(false);
      }
    },
    [participantsByQuizId, submissionsByQuizId]
  );

  useEffect(() => {
    if (!selectedReport?.quiz?.id || !reportModalView) return;
    const quiz = quizzes.find((q) => q.id === selectedReport.quiz.id);
    if (!quiz) return;
    const updated = collectReportDataForQuiz(
      quiz,
      submissionsByQuizId,
      participantsByQuizId,
      apiFallbackByQuizId,
      { includeDetails: true }
    );
    if (Number(updated.submittedCount) <= 0) return;
    setSelectedReport(updated);
    const fallback = apiFallbackByQuizId[updated.quiz.id];
    const launches = buildLaunchHistory(
      updated.quiz,
      updated.submissions,
      fallback?.participants || [],
      fallback?.launches || null
    );
    setLaunchHistory(launches);
    let activeLaunch = selectedLaunch;
    if (selectedLaunch?.id) {
      const refreshedLaunch = launches.find((l: any) => l.id === selectedLaunch.id);
      if (refreshedLaunch) {
        activeLaunch = refreshedLaunch;
        setSelectedLaunch(refreshedLaunch);
      }
    }
    if (selectedSubmission?.participantId && reportModalView === 'detail') {
      const source = activeLaunch || updated;
      const refreshedSub = (source.submissions || []).find(
        (s: any) => s.participantId === selectedSubmission.participantId
      );
      if (refreshedSub) setSelectedSubmission(refreshedSub);
    }
  }, [
    quizzes,
    submissionsByQuizId,
    participantsByQuizId,
    apiFallbackByQuizId,
    selectedReport?.quiz?.id,
    selectedLaunch?.id,
    selectedSubmission?.participantId,
    reportModalView,
  ]);

  const handleDeleteQuiz = async () => {
    if (!deleteConfirmQuizId) return;
    setDeleting(true);
    try {
      const response = await apiRequest<{ success?: boolean; error?: string }>(
        `/quizzes/${deleteConfirmQuizId}`,
        { method: 'DELETE' }
      );
      if (!response.success) throw new Error(response.error || 'Delete failed');
      if (selectedReport?.quiz?.id === deleteConfirmQuizId) closeReportModal();
      setDeleteConfirmQuizId(null);
      await refreshQuizzes();
    } catch (err) {
      // keep modal open on failure — user sees confirm again
    } finally {
      setDeleting(false);
    }
  };

  const participantRows = useMemo(() => {
    if (!selectedLaunch) return [];
    return (selectedLaunch.submissions || []).filter(
      (s: any) => isSubmittedRow(s) || s._joinedOnly
    );
  }, [selectedLaunch]);

  /** Display order only — same as web: highest launchNumber first. */
  const launchesNewestFirst = useMemo(
    () =>
      launchHistory
        .slice()
        .sort((a: any, b: any) => Number(b.launchNumber || 0) - Number(a.launchNumber || 0)),
    [launchHistory]
  );

  /** Display order only — same as web: score desc, then submittedAt. */
  const participantsSorted = useMemo(
    () =>
      participantRows.slice().sort(
        (a: any, b: any) =>
          Number(b.percentage || 0) - Number(a.percentage || 0) ||
          String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
      ),
    [participantRows]
  );

  const onModalRequestClose = useCallback(() => {
    if (reportModalView === 'detail') {
      setSelectedSubmission(null);
      setReportModalView('participants');
      return;
    }
    if (reportModalView === 'participants') {
      setSelectedLaunch(null);
      setSelectedSubmission(null);
      setReportModalView('launches');
      return;
    }
    closeReportModal();
  }, [reportModalView, closeReportModal]);

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.subtitle}>
            Quiz performance overview and detailed participant results
          </Text>
          <View style={styles.stats}>
            {[
              ['Quizzes', overviewStats.totalQuizzes],
              ['Participants', overviewStats.totalParticipants],
              ['Avg score', `${overviewStats.avgScore}%`],
              ['Pass rate', `${overviewStats.passRate}%`],
            ].map(([label, value]) => (
              <View key={String(label)} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.passCaption}>Passing: {PASS_THRESHOLD}%+</Text>
        </View>

        <View style={styles.reportsCard}>
          <Text style={styles.sectionTitle}>Quiz reports</Text>
          <Text style={styles.sectionSubtitle}>
            View participant marks or remove a quiz from your library
          </Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color="#8A7F89" style={styles.searchIcon} />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search quizzes..."
              placeholderTextColor="#8A7F89"
              style={styles.search}
              accessibilityLabel="Search quizzes"
            />
          </View>
          <View style={styles.reportsDivider} />

          {loading ? (
            <View style={styles.inlineCentered}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.emptyText}>Loading reports...</Text>
            </View>
          ) : filteredReports.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchTerm.trim() ? 'No quizzes found' : 'No quizzes found in your library.'}
            </Text>
          ) : (
            <View style={styles.quizList}>
              {filteredReports.map((report: any) => (
                <View key={report.quiz.id} style={styles.quizCard}>
                  <Text style={styles.quizTitle}>{report.quiz.title || 'Untitled Quiz'}</Text>
                  <Text style={styles.quizMeta}>
                    {normalizeQuizTypeLabel(report.quiz.type || 'Quiz')} ·{' '}
                    {report.quiz.questionCount ??
                      normalizeQuestionsList(report.quiz.questions).length ??
                      0}{' '}
                    questions
                  </Text>
                  <View style={styles.metaBlock}>
                    <MetaRow label="Audience Joined" value={String(report.participantCount)} />
                    <MetaRow
                      label="Avg Score"
                      value={report.avgScore != null ? `${report.avgScore}%` : '—'}
                    />
                    <MetaRow label="Pass / Fail">
                      {report.submittedCount > 0 ? (
                        <Text style={styles.metaValue}>
                          <Text style={styles.passCount}>{report.passCount} passed</Text>
                          <Text style={styles.metaMuted}> · </Text>
                          <Text style={styles.failCount}>{report.failCount} failed</Text>
                        </Text>
                      ) : report.participantCount > 0 ? (
                        <Text style={styles.metaMuted}>Joined · no score yet</Text>
                      ) : (
                        <Text style={styles.metaMuted}>—</Text>
                      )}
                    </MetaRow>
                    <MetaRow
                      label="Date"
                      value={formatDate(
                        report.quiz.launchSettings?.launchedAt ||
                          report.quiz.launchedAt ||
                          report.quiz.createdAt
                      )}
                      muted
                    />
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => openQuizReport(report)}
                      style={({ pressed }) => [
                        styles.viewBtn,
                        pressed && styles.viewBtnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="View reports">
                      <Ionicons name="eye-outline" size={16} color="#2B1F27" />
                      <Text style={styles.viewBtnLabel}>View</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setDeleteConfirmQuizId(report.quiz.id)}
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        pressed && styles.deleteBtnPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Delete quiz report">
                      <Ionicons name="trash-outline" size={16} color="#B3261E" />
                      <Text style={styles.deleteBtnLabel}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedReport && reportModalView)}
        transparent
        animationType="fade"
        onRequestClose={onModalRequestClose}>
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeReportModal}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View style={styles.modalCard} accessibilityViewIsModal>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                {reportModalView === 'detail' && selectedSubmission ? (
                  <>
                    <Pressable
                      onPress={() => {
                        setSelectedSubmission(null);
                        setReportModalView('participants');
                      }}
                      style={styles.backRow}
                      accessibilityRole="button"
                      accessibilityLabel="Back">
                      <Ionicons name="arrow-back" size={16} color="#6B3A5C" />
                      <Text style={styles.backLink}>Back to participants</Text>
                    </Pressable>
                    <Text style={styles.modalTitle}>
                      {selectedSubmission.studentName || 'Anonymous Audience'}
                    </Text>
                    <Text style={styles.modalHint}>
                      {selectedReport?.quiz?.title} · {Number(selectedSubmission.percentage || 0)}% ·{' '}
                      {Number(selectedSubmission.percentage || 0) >= PASS_THRESHOLD
                        ? 'Passed'
                        : 'Failed'}
                    </Text>
                    <View style={styles.modalMetaRow}>
                      <Text style={styles.modalHint}>
                        {selectedSubmission.correctAnswers ?? '—'}/
                        {selectedSubmission.totalQuestions ?? '—'} correct
                      </Text>
                      {formatDurationForReport(
                        normalizeTimeTakenSeconds(selectedSubmission) ??
                          selectedSubmission.timeTaken
                      ) ? (
                        <View style={styles.clockRow}>
                          <Ionicons name="time-outline" size={14} color="#5F5460" />
                          <Text style={styles.modalHint}>
                            {formatDurationForReport(
                              normalizeTimeTakenSeconds(selectedSubmission) ??
                                selectedSubmission.timeTaken
                            )}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : reportModalView === 'participants' && selectedLaunch ? (
                  <>
                    <Pressable
                      onPress={() => {
                        setSelectedLaunch(null);
                        setSelectedSubmission(null);
                        setReportModalView('launches');
                      }}
                      style={styles.backRow}
                      accessibilityRole="button"
                      accessibilityLabel="Back">
                      <Ionicons name="arrow-back" size={16} color="#6B3A5C" />
                      <Text style={styles.backLink}>Back to launch history</Text>
                    </Pressable>
                    <Text style={styles.launchBadge}>Launch {selectedLaunch.launchNumber}</Text>
                    <Text style={styles.modalTitle}>{selectedReport?.quiz?.title}</Text>
                    <Text style={styles.modalHint}>
                      {selectedLaunch.joinedCount} audience member
                      {selectedLaunch.joinedCount === 1 ? '' : 's'} joined
                      {selectedLaunch.submittedCount > 0
                        ? ` · ${selectedLaunch.submittedCount} submitted`
                        : ''}
                      {selectedLaunch.avgScore != null
                        ? ` · Average ${selectedLaunch.avgScore}%`
                        : ''}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.launchBadge}>Launch History</Text>
                    <Text style={styles.modalTitle}>{selectedReport?.quiz?.title}</Text>
                    <Text style={styles.modalHint}>
                      Each launch is kept separately so earlier reports are never overwritten.
                    </Text>
                  </>
                )}
              </View>
              <Pressable
                onPress={closeReportModal}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Ionicons name="close" size={20} color="#5F5460" />
              </Pressable>
            </View>
            <View style={styles.modalHairline} />

            {loadingReportDetail ? (
              <View style={styles.modalBodyCentered}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.emptyText}>Loading launch history...</Text>
              </View>
            ) : reportModalView === 'detail' && selectedSubmission ? (
              <ScrollView
                style={styles.modalScroller}
                contentContainerStyle={styles.modalList}
                showsVerticalScrollIndicator>
                <QuestionReview
                  submission={enrichSubmission(selectedSubmission, selectedReport.quiz)}
                  quizType={selectedSubmission.quizType || selectedReport.quiz.type}
                />
              </ScrollView>
            ) : reportModalView === 'participants' ? (
              <ScrollView
                style={styles.modalScroller}
                contentContainerStyle={styles.modalList}
                showsVerticalScrollIndicator>
                {participantsSorted.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No audience members have joined this launch yet.
                  </Text>
                ) : (
                  participantsSorted.map((item: any, index: number) => {
                    const submitted = isSubmittedRow(item);
                    const percentage = submitted ? Number(item.percentage || 0) : null;
                    const passed = submitted && percentage >= PASS_THRESHOLD;
                    const durationLabel = formatDurationForReport(
                      normalizeTimeTakenSeconds(item) ?? item.timeTaken
                    );
                    const name = item.studentName || 'Anonymous Audience';
                    return (
                      <View
                        key={String(item.participantId || item.id || index)}
                        style={styles.launchCard}>
                        <Text style={styles.launchTitle} numberOfLines={1}>
                          {name}
                        </Text>
                        <View style={styles.participantMeta}>
                          {submitted ? (
                            <>
                              <Text style={styles.scoreText}>{percentage}%</Text>
                              <Text style={styles.modalHint}>
                                {item.correctAnswers ?? '—'}/{item.totalQuestions ?? '—'} correct
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.modalHint}>Joined · score not synced yet</Text>
                          )}
                          {durationLabel ? (
                            <View style={styles.clockRow}>
                              <Ionicons name="time-outline" size={14} color="#5F5460" />
                              <Text style={styles.modalHint}>{durationLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.participantFooter}>
                          <View
                            style={[
                              styles.statusPill,
                              !submitted
                                ? styles.statusJoined
                                : passed
                                  ? styles.statusPassed
                                  : styles.statusFailed,
                            ]}>
                            <Text
                              style={[
                                styles.statusPillText,
                                !submitted
                                  ? styles.statusJoinedText
                                  : passed
                                    ? styles.statusPassedText
                                    : styles.statusFailedText,
                              ]}>
                              {!submitted ? 'Joined' : passed ? 'Passed' : 'Failed'}
                            </Text>
                          </View>
                          {submitted ? (
                            <Pressable
                              onPress={() => {
                                setSelectedSubmission(item);
                                setReportModalView('detail');
                              }}
                              hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                              style={({ pressed }) => [
                                styles.detailsBtn,
                                pressed && styles.plumBtnPressed,
                              ]}
                              accessibilityRole="button"
                              accessibilityLabel={`View details for ${name}`}>
                              <Ionicons name="eye-outline" size={16} color={COLORS.white} />
                              <Text style={styles.detailsBtnLabel}>View details</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.modalScroller}
                contentContainerStyle={styles.modalList}
                showsVerticalScrollIndicator>
                {launchesNewestFirst.length === 0 ? (
                  <Text style={styles.emptyText}>No launches recorded for this quiz yet.</Text>
                ) : (
                  launchesNewestFirst.map((item: any) => (
                    <View key={String(item.id)} style={styles.launchCard}>
                      <Text style={styles.launchTitle}>Launch {item.launchNumber}</Text>
                      <View style={styles.launchMeta}>
                        <Text style={styles.modalHint}>{formatDate(item.launchedAt)}</Text>
                        <Text style={styles.modalHint}>
                          {item.joinedCount} participant
                          {item.joinedCount === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setSelectedLaunch(item);
                          setSelectedSubmission(null);
                          setReportModalView('participants');
                        }}
                        style={({ pressed }) => [
                          styles.plumBtn,
                          pressed && styles.plumBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`View launch ${item.launchNumber} participants`}>
                        <Ionicons name="eye-outline" size={16} color={COLORS.white} />
                        <Text style={styles.plumBtnLabel}>View</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={Boolean(deleteConfirmQuizId)}
        title="Remove quiz from library?"
        message="Quiz is soft-deleted. Past attempts remain available in reports."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onCancel={() => setDeleteConfirmQuizId(null)}
        onConfirm={handleDeleteQuiz}
      />
    </KeyboardSafeScreen>
  );
}

function MetaRow({
  label,
  value,
  children,
  muted,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
  muted?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      {children || (
        <Text style={[styles.metaValue, muted && styles.metaMuted]}>{value}</Text>
      )}
    </View>
  );
}

function QuestionReview({ submission, quizType }: { submission: any; quizType: any }) {
  const questions = normalizeQuestionsForScoring(
    normalizeQuestionsList(submission.questions),
    quizType
  );
  const totalQuestions = questions.length || submission.totalQuestions || 0;

  if (!questions.length) {
    return (
      <Text style={styles.emptyText}>No question details available for this submission.</Text>
    );
  }

  return (
    <View style={styles.qList}>
      {questions.map((question: any, index: number) => {
        const studentAnswerRaw = extractSubmissionAnswer(submission.answers, index, question);
        let studentAnswer = formatAnswerDisplay(studentAnswerRaw);
        const questionType = normalizeQuizTypeLabel(question.type || quizType).toLowerCase();
        const isMultipleChoice =
          questionType.includes('multiple') || questionType === 'mcq';
        const correctIdx = isMultipleChoice ? getCorrectOptionIndex(question) : null;
        const selectedIdx = isMultipleChoice
          ? getSelectedOptionIndex(question, studentAnswerRaw)
          : null;
        if (isMultipleChoice && selectedIdx != null && question.options?.[selectedIdx]) {
          studentAnswer = getOptionText(question.options[selectedIdx]) || studentAnswer;
        }
        const { isCorrect } = reviewQuestionAnswer(
          question,
          studentAnswerRaw,
          quizType,
          totalQuestions
        );

        return (
          <View
            key={question.id || index}
            style={[styles.qCard, isCorrect ? styles.qCorrect : styles.qWrong]}>
            <View style={styles.qHead}>
              <View
                style={[styles.qIcon, isCorrect ? styles.qIconCorrect : styles.qIconWrong]}>
                <Ionicons
                  name={isCorrect ? 'checkmark' : 'close'}
                  size={12}
                  color={COLORS.white}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.qLabel}>Question {index + 1}</Text>
                <Text style={styles.qPrompt}>
                  {question.questionText || question.text || `Question ${index + 1}`}
                </Text>
              </View>
            </View>
            {isMultipleChoice && Array.isArray(question.options) ? (
              <View style={styles.optList}>
                {question.options.map((option: any, optIdx: number) => {
                  const text = getOptionText(option);
                  const isOptionCorrect = optIdx === correctIdx;
                  const isOptionSelected = optIdx === selectedIdx;
                  return (
                    <View
                      key={optIdx}
                      style={[
                        styles.optRow,
                        isOptionCorrect && styles.optCorrect,
                        isOptionSelected && !isOptionCorrect && styles.optWrong,
                      ]}>
                      <View
                        style={[
                          styles.optLetter,
                          isOptionSelected && !isOptionCorrect && styles.optLetterWrong,
                        ]}>
                        <Text
                          style={[
                            styles.optLetterText,
                            isOptionSelected && !isOptionCorrect && styles.optLetterTextOn,
                          ]}>
                          {String.fromCharCode(65 + optIdx)}
                        </Text>
                      </View>
                      <Text style={styles.optText}>{text || `Option ${optIdx + 1}`}</Text>
                      {isOptionSelected && !isOptionCorrect ? (
                        <Text style={styles.choseTag}>Audience chose</Text>
                      ) : isOptionCorrect ? (
                        <Text style={styles.correctTag}>Correct answer</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.textAnswerBlock}>
                <Text style={styles.modalHint}>
                  Audience answer:{' '}
                  <Text style={isCorrect ? styles.passCount : styles.failCount}>
                    {studentAnswer}
                  </Text>
                </Text>
                {!isCorrect && (question.sampleAnswer || question.correctAnswer != null) ? (
                  <Text style={styles.modalHint}>
                    Correct answer:{' '}
                    <Text style={styles.passCount}>
                      {formatAnswerDisplay(question.correctAnswer ?? question.sampleAnswer)}
                    </Text>
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  pageContent: { paddingBottom: 20 },
  header: {
    backgroundColor: '#6B3A5C',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },
  subtitle: { color: '#EADBE5', fontSize: 13, marginTop: SPACING[1] },
  stats: {
    marginTop: SPACING[4],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
  },
  stat: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: SPACING[3],
    alignItems: 'center',
  },
  statValue: { color: COLORS.white, fontWeight: FONT_WEIGHTS.bold, fontSize: 18 },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  passCaption: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: SPACING[2] },
  reportsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: { color: '#2B1F27', fontSize: 18, fontWeight: FONT_WEIGHTS.bold },
  sectionSubtitle: { color: '#5F5460', fontSize: 12, marginTop: 4 },
  searchWrap: {
    marginTop: 12,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  search: {
    flex: 1,
    height: 44,
    fontSize: 13,
    color: '#2B1F27',
    padding: 0,
  },
  reportsDivider: {
    height: 1,
    backgroundColor: '#EFE7EC',
    marginVertical: 14,
  },
  inlineCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#5F5460',
    fontSize: 13,
    paddingVertical: 16,
  },
  quizList: { gap: 12 },
  quizCard: {
    backgroundColor: '#F2EBF0',
    borderWidth: 1,
    borderColor: '#E3D6DE',
    borderRadius: 18,
    padding: 14,
  },
  quizTitle: { color: '#2B1F27', fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  quizMeta: { color: '#5F5460', fontSize: 12, marginTop: 2 },
  metaBlock: { marginTop: 12, gap: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  metaLabel: {
    color: '#2B1F27',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  metaValue: { color: '#2B1F27', fontSize: 13, textAlign: 'right', flex: 1 },
  metaMuted: { color: '#5F5460', fontSize: 13, textAlign: 'right' },
  passCount: { color: '#15803D', fontWeight: FONT_WEIGHTS.medium },
  failCount: { color: '#B3261E', fontWeight: FONT_WEIGHTS.medium },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  viewBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewBtnPressed: { backgroundColor: '#F7F2F5' },
  viewBtnLabel: { color: '#2B1F27', fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  deleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F5B5B0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteBtnPressed: { backgroundColor: '#FBEAE8' },
  deleteBtnLabel: { color: '#B3261E', fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '92%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
  },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    marginRight: -8,
  },
  modalHairline: { height: 1, backgroundColor: '#EFE7EC' },
  modalScroller: { flexShrink: 1, maxHeight: '70%' },
  modalList: { padding: 16, gap: 12 },
  modalBodyCentered: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    alignSelf: 'flex-start',
  },
  backLink: {
    color: '#6B3A5C',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  modalTitle: { color: '#2B1F27', fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  modalHint: { color: '#5F5460', fontSize: 12 },
  modalMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  launchBadge: {
    color: '#6B3A5C',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  launchCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#ECE3EA',
    borderRadius: 14,
    padding: 12,
  },
  launchTitle: { color: '#2B1F27', fontSize: 15, fontWeight: FONT_WEIGHTS.bold },
  launchMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  plumBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6B3A5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  plumBtnPressed: { backgroundColor: '#5A2F4D' },
  plumBtnLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  participantMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  scoreText: { color: '#2B1F27', fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  participantFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPassed: { backgroundColor: '#DCFCE7' },
  statusFailed: { backgroundColor: '#FEE2E2' },
  statusJoined: { backgroundColor: 'rgba(107,58,92,0.1)' },
  statusPillText: { fontSize: 11, fontWeight: FONT_WEIGHTS.semibold },
  statusPassedText: { color: '#15803D' },
  statusFailedText: { color: '#B3261E' },
  statusJoinedText: { color: '#6B3A5C' },
  detailsBtn: {
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#6B3A5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  detailsBtnLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  qList: { gap: 12 },
  qCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  qCorrect: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  qWrong: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  qHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  qIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  qIconCorrect: { backgroundColor: '#22C55E' },
  qIconWrong: { backgroundColor: '#EF4444' },
  qLabel: {
    color: '#5F5460',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qPrompt: {
    color: '#2B1F27',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
  },
  optList: { marginTop: 8, gap: 8 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE3EA',
    backgroundColor: COLORS.white,
    padding: 10,
  },
  optCorrect: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  optWrong: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  optLetter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1EDF0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optLetterWrong: { backgroundColor: '#EF4444' },
  optLetterText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  optLetterTextOn: { color: COLORS.white },
  optText: { color: '#2B1F27', fontSize: 13, flex: 1 },
  choseTag: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#B3261E',
  },
  correctTag: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#15803D',
  },
  textAnswerBlock: { marginTop: 8, gap: 4 },
});
