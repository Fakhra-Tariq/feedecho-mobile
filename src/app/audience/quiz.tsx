import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { showAlert } from '@/components/feedback';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { useAuth } from '@/context/AuthContext';
import { useLeaveActivity } from '@/lib/audienceHomeNavigation';
import { normalizeQuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import {
  hasLocalQuizSubmission,
  readQuizParticipantSession,
  readStudentQuizSession,
  saveLocalQuizSubmission,
  type AudienceQuizSession,
} from '@/lib/audienceQuizSession';
import { submitQuizWithRetry } from '@/lib/audienceQuizSubmit';
import {
  applyQuizShuffleSettings,
  isQuizJoinWindowExpired,
  resolveRegularQuizTimeLeft,
} from '@/lib/quizLaunchAudienceSettings';
import {
  calculateScore,
  getStableQuestionId,
  normalizeAnswersByQuestionId,
  validateQuizData,
} from '@/lib/scoringUtils';

function formatCountdown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizeQuestionsList(questions: unknown): any[] {
  if (Array.isArray(questions)) return questions.filter(Boolean);
  if (questions && typeof questions === 'object') {
    return Object.keys(questions as object)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (questions as any)[key])
      .filter(Boolean);
  }
  return [];
}

function getEffectiveQuestionType(quizType: string | undefined, question: any) {
  const normalized = normalizeQuizTypeLabel(quizType);
  if (normalized === 'Mixed Type' && question?.type) {
    const t = String(question.type).toLowerCase();
    if (t.includes('multiple')) return 'Multiple Choice';
    if (t.includes('true')) return 'True / False';
    if (t.includes('short')) return 'Short Answer';
    if (t.includes('long')) return 'Long Answer';
  }
  return normalized;
}

function optionText(option: any) {
  if (typeof option === 'string') return option;
  return option?.text ?? option?.label ?? String(option ?? '');
}

/** Same copy as Web AudienceQuizAttempt getPerformanceComment. */
function getPerformanceComment(percentage: number) {
  if (percentage >= 90) return "Outstanding! You're a star performer! 🌟";
  if (percentage >= 80) return 'Excellent work! You really know your stuff! 🎯';
  if (percentage >= 65) return 'Great job! Keep up the good work! 👏';
  if (percentage >= 50) return 'Good effort! Room for improvement! 💪';
  if (percentage >= 35) return 'Nice try! Keep practicing! 📚';
  return "Keep learning! You'll do better next time! 🌱";
}

/**
 * Live audience quiz — same destination Web uses after join: /audience/quiz/:quizId.
 * Loads locked studentSession from join; submits via POST /quiz-submissions/{id}/submit.
 * Guests omit studentUid/studentEmail on submit (matches Web).
 */
export default function AudienceQuizScreen() {
  const { profile } = useAuth();
  const isGuest = Boolean(profile?.guest);
  const params = useLocalSearchParams<{ quizId?: string }>();
  const quizIdParam = String(params.quizId || '');
  const { leave: goHome } = useLeaveActivity();
  const leftResultRef = useRef(false);
  const [redirectCountdown, setRedirectCountdown] = useState(10);

  const [session, setSession] = useState<AudienceQuizSession | null>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultScore, setResultScore] = useState<{
    percentage: number;
    correctAnswers: number;
    totalQuestions: number;
  } | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncError, setSyncError] = useState('');
  const quizStartedAtRef = useRef<number | null>(null);
  const autoSubmitRef = useRef(false);

  const leaveHomeOnce = () => {
    if (leftResultRef.current) return;
    leftResultRef.current = true;
    goHome();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const stored = await readStudentQuizSession();
        if (!stored?.isLocked || !stored.quizId) {
          if (!cancelled) {
            setError('No active quiz session. Please join with a session code.');
          }
          return;
        }
        if (quizIdParam && String(stored.quizId) !== quizIdParam) {
          if (!cancelled) {
            setError('Quiz session does not match. Please rejoin the session code.');
          }
          return;
        }

        const foundQuiz = stored.quiz;
        if (!foundQuiz || !(foundQuiz.launched || stored.quiz)) {
          if (!cancelled) setError('Quiz not found or not launched');
          return;
        }
        if (isQuizJoinWindowExpired(foundQuiz.launchSettings)) {
          if (!cancelled) setError('This quiz is no longer joinable.');
          return;
        }
        if (
          foundQuiz.launchSettings?.oneAttempt &&
          (await hasLocalQuizSubmission(String(stored.quizId), {
            participantId: stored.participantId,
            studentUid: stored.studentUid,
            studentEmail: stored.studentEmail,
            studentName: stored.studentName,
          }))
        ) {
          if (!cancelled) setError('You have already completed this quiz.');
          return;
        }

        let quizToUse = {
          ...foundQuiz,
          id: foundQuiz.id || stored.quizId,
          type: normalizeQuizTypeLabel(foundQuiz.type),
          questions: normalizeQuestionsList(foundQuiz.questions),
          launched: true,
        };
        quizToUse = applyQuizShuffleSettings(quizToUse, stored.participantId);

        if (!cancelled) {
          setSession(stored);
          setQuiz(quizToUse);
          setTimeLeft(resolveRegularQuizTimeLeft(quizToUse, stored.joinedAt));
          quizStartedAtRef.current = Date.now();
        }
      } catch {
        if (!cancelled) setError('Failed to load quiz');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizIdParam]);

  useEffect(() => {
    if (timeLeft == null || isSubmitted) return undefined;
    if (timeLeft <= 0) {
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true;
        void onSubmit();
      }
      return undefined;
    }
    const id = setInterval(() => {
      setTimeLeft((prev) => (prev == null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only tick timer
  }, [timeLeft, isSubmitted]);

  useEffect(() => {
    if (!isSubmitted) return undefined;
    setRedirectCountdown(10);
    const id = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          leaveHomeOnce();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- countdown only while submitted
  }, [isSubmitted]);

  const questions = useMemo(
    () => (Array.isArray(quiz?.questions) ? quiz.questions : []),
    [quiz]
  );
  const question = questions[currentQuestion];
  const effectiveType = getEffectiveQuestionType(quiz?.type, question);
  const questionKey = question ? getStableQuestionId(question, currentQuestion) : '';

  const answeredCount = questions.filter((q: any, index: number) => {
    const key = getStableQuestionId(q, index);
    const value = answers[key] ?? answers[String(key)] ?? answers[index] ?? answers[String(index)];
    return value != null && String(value).trim() !== '';
  }).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;

  const setAnswer = (value: any) => {
    if (!questionKey) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  };

  const currentAnswer =
    answers[questionKey] ??
    answers[String(questionKey)] ??
    answers[currentQuestion] ??
    answers[String(currentQuestion)] ??
    '';

  const onSubmit = async () => {
    if (!quiz || isSubmitting || isSubmitted) return;
    setIsSubmitting(true);
    try {
      const validation = validateQuizData(quiz);
      if (!validation.isValid) {
        // Server still scores against canonical quiz; continue like Web.
      }

      const effectiveAnswers = normalizeAnswersByQuestionId(quiz.questions, answers);
      const scoringResult = calculateScore(quiz.questions, effectiveAnswers, quiz.type);
      const { score: totalPoints, correctAnswers, totalQuestions, percentage } = scoringResult;

      const participantBackup = await readQuizParticipantSession(String(quiz.id));
      const effectiveStudentName =
        session?.studentName || participantBackup?.studentName || 'Audience';
      const effectiveSessionCode =
        session?.sessionCode || participantBackup?.sessionCode || '';
      const effectiveParticipantId =
        session?.participantId || participantBackup?.participantId || null;
      const effectiveStudentUid = session?.studentUid || participantBackup?.studentUid || null;
      const effectiveStudentEmail =
        session?.studentEmail || participantBackup?.studentEmail || null;

      const timeTaken = (() => {
        if (quiz.launchSettings?.timeLimit != null && timeLeft != null) {
          return Math.max(1, Math.round(quiz.launchSettings.timeLimit * 60 - timeLeft));
        }
        if (quiz.launchSettings?.timePerStudentMinutes != null && timeLeft != null) {
          return Math.max(
            1,
            Math.round(quiz.launchSettings.timePerStudentMinutes * 60 - timeLeft)
          );
        }
        if (quizStartedAtRef.current) {
          return Math.max(1, Math.round((Date.now() - quizStartedAtRef.current) / 1000));
        }
        return 1;
      })();

      const baseLocalSubmission = {
        studentName: effectiveStudentName,
        sessionCode: effectiveSessionCode,
        quizId: quiz.id,
        participantId: effectiveParticipantId,
        quizTitle: quiz.title,
        quizType: quiz.type,
        questions: quiz.questions,
        answers: effectiveAnswers,
        score: correctAnswers,
        correctAnswers,
        totalQuestions: quiz.questions.length,
        percentage,
        points: totalPoints,
        submittedAt: new Date().toISOString(),
        timeTaken,
        source: 'quiz',
        serverSynced: false,
        ...(effectiveStudentUid ? { studentUid: effectiveStudentUid } : {}),
        ...(effectiveStudentEmail ? { studentEmail: effectiveStudentEmail } : {}),
      };

      const submissionData: Record<string, unknown> = {
        participantId: effectiveParticipantId,
        studentName: effectiveStudentName,
        sessionCode: effectiveSessionCode,
        answers: effectiveAnswers,
        timeTaken,
        ...(effectiveStudentUid ? { studentUid: effectiveStudentUid } : {}),
        ...(effectiveStudentEmail ? { studentEmail: effectiveStudentEmail } : {}),
      };

      if (!effectiveParticipantId) {
        setSyncFailed(true);
        setSyncError('Missing participant session. Please rejoin the quiz code and submit again.');
        await saveLocalQuizSubmission({ ...baseLocalSubmission, syncError: syncError });
        setResultScore({
          percentage,
          correctAnswers,
          totalQuestions: quiz.questions.length,
        });
        setIsSubmitted(true);
        return;
      }

      const syncResult = await submitQuizWithRetry(String(quiz.id), submissionData);
      if (syncResult.success) {
        setSyncFailed(false);
        setSyncError('');
        await saveLocalQuizSubmission({
          ...baseLocalSubmission,
          score: syncResult.data?.correctAnswers ?? correctAnswers,
          correctAnswers: syncResult.data?.correctAnswers ?? correctAnswers,
          percentage: syncResult.data?.percentage ?? percentage,
          points: syncResult.data?.score ?? totalPoints,
          submittedAt: syncResult.data?.submittedAt || baseLocalSubmission.submittedAt,
          serverSynced: true,
          syncError: null,
        });
        setResultScore({
          percentage: syncResult.data?.percentage ?? percentage,
          correctAnswers: syncResult.data?.correctAnswers ?? correctAnswers,
          totalQuestions: quiz.questions.length,
        });
      } else {
        setSyncFailed(true);
        setSyncError(
          syncResult.error ||
            'Submission failed to reach the server. Your answers are saved on this device.'
        );
        await saveLocalQuizSubmission({
          ...baseLocalSubmission,
          syncError: syncResult.error || 'sync failed',
        });
        setResultScore({
          percentage,
          correctAnswers,
          totalQuestions: totalQuestions || quiz.questions.length,
        });
      }
      setIsSubmitted(true);
    } catch (err) {
      showAlert({
        type: 'error',
        title: 'Submit failed',
        message: cleanErrorMessage(err, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (error || !quiz || questions.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.iconMuted} />
        <Text style={styles.errorTitle}>{error || 'Quiz not available'}</Text>
        <AppButton
          label="Back"
          onPress={goHome}
          style={{ marginTop: SPACING[4], minWidth: 160 }}
        />
      </View>
    );
  }

  if (isSubmitted && resultScore) {
    const displayScore = resultScore.correctAnswers;
    const displayTotal = resultScore.totalQuestions;
    const displayPercentage = Math.round(resultScore.percentage ?? 0);
    const showFinalScore = quiz?.launchSettings?.showFinalScore !== false;
    const countdownWidth = `${(redirectCountdown / 10) * 100}%`;

    return (
      <View style={styles.resultScreen}>
        <ScrollView
          contentContainerStyle={styles.resultScroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.resultCard}>
            <View style={styles.resultIconWrap}>
              <Ionicons name="checkmark-circle" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.resultTitle}>Quiz Completed!</Text>
            <Text style={styles.resultComment}>
              {showFinalScore
                ? getPerformanceComment(displayPercentage)
                : 'Thank you for completing the quiz!'}
            </Text>

            {syncFailed ? <Text style={styles.error}>{syncError}</Text> : null}

            {showFinalScore ? (
              <View style={styles.scorePanel}>
                <Text style={styles.scorePct}>{displayPercentage}%</Text>
                <Text style={styles.scoreLine}>
                  You got {displayScore} out of {displayTotal} questions correct
                </Text>
                <View style={styles.scoreBarTrack}>
                  <View style={[styles.scoreBarFill, { width: `${displayPercentage}%` }]} />
                </View>
                <View style={styles.statRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNum}>{displayScore}</Text>
                    <Text style={styles.statLabel}>Correct</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNum}>{displayTotal - displayScore}</Text>
                    <Text style={styles.statLabel}>Incorrect</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statNum}>{displayTotal}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                </View>
              </View>
            ) : null}

            <Text style={styles.redirectText}>
              Redirecting to homepage in{' '}
              <Text style={styles.redirectSecs}>{redirectCountdown}</Text> seconds...
            </Text>
            <View style={styles.redirectTrack}>
              <View style={[styles.redirectFill, { width: countdownWidth }]} />
            </View>

            <AppButton label="Go to Home" onPress={leaveHomeOnce} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardSafeScreen
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
        <View style={styles.headerBlock}>
          <Text style={styles.heading}>{quiz.title}</Text>
          <Text style={styles.hint}>
            {quiz.type} · {session?.studentName || 'Audience'}
          </Text>
          {timeLeft != null ? (
            <View style={styles.timerRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.primary} />
              <Text style={styles.timerText}>Time remaining: {formatCountdown(timeLeft)}</Text>
            </View>
          ) : null}
        </View>

        <AppCard style={styles.card}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              Question {currentQuestion + 1} of {questions.length}
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress)}% Complete</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <Text style={styles.questionText}>{question?.questionText || question?.text || ''}</Text>

          {effectiveType === 'Multiple Choice' || effectiveType === 'True / False' ? (
            <View style={styles.options}>
              {(effectiveType === 'True / False'
                ? ['True', 'False']
                : (question?.options || []).map(optionText)
              ).map((opt: string) => {
                const selected = String(currentAnswer) === String(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => setAnswer(opt)}>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TextInput
              value={String(currentAnswer || '')}
              onChangeText={setAnswer}
              multiline={effectiveType === 'Long Answer'}
              placeholder="Your answer"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={[styles.input, effectiveType === 'Long Answer' && styles.multiline]}
            />
          )}

          <View style={styles.navRow}>
            <AppButton
              label="Previous"
              variant="ghost"
              fullWidth={false}
              disabled={currentQuestion === 0}
              onPress={() => setCurrentQuestion((i) => Math.max(0, i - 1))}
              style={styles.navBtn}
            />
            {currentQuestion < questions.length - 1 ? (
              <AppButton
                label="Next"
                fullWidth={false}
                onPress={() =>
                  setCurrentQuestion((i) => Math.min(questions.length - 1, i + 1))
                }
                style={styles.navBtn}
              />
            ) : (
              <AppButton
                label={isSubmitting ? 'Submitting...' : 'Submit'}
                loading={isSubmitting}
                fullWidth={false}
                onPress={onSubmit}
                style={styles.navBtn}
              />
            )}
          </View>
        </AppCard>
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
    padding: SPACING[6],
  },
  content: { padding: SPACING[6], gap: SPACING[4], paddingBottom: SPACING[16] },
  card: { ...SHADOWS.raised },
  headerBlock: { gap: SPACING[3] },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },
  hint: { color: COLORS.darkTextSecondary },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING[3],
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
  },
  timerText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING[2],
  },
  progressLabel: { ...TYPE.caption },
  progressPct: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.mutedSoft,
    overflow: 'hidden',
    marginBottom: SPACING[4],
  },
  progressFill: { height: 5, backgroundColor: COLORS.primary },
  questionText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 24,
    marginBottom: SPACING[4],
  },
  options: { gap: SPACING[2] },
  option: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    backgroundColor: COLORS.surfaceMuted,
  },
  optionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.blush,
  },
  optionText: { color: COLORS.text, fontSize: 15 },
  optionTextSelected: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    minHeight: 48,
    paddingHorizontal: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top', paddingTop: SPACING[3] },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING[5],
    gap: SPACING[3],
  },
  navBtn: { minWidth: 120 },
  errorTitle: { ...TYPE.title, textAlign: 'center', marginTop: SPACING[3] },
  error: { color: COLORS.dangerText, textAlign: 'center', marginTop: SPACING[3] },
  resultScreen: { flex: 1, backgroundColor: COLORS.background },
  resultScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING[6],
    paddingBottom: SPACING[16],
  },
  resultCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[8],
    alignItems: 'center',
    ...SHADOWS.raised,
  },
  resultIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[6],
  },
  resultTitle: {
    ...TYPE.title,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: SPACING[3],
  },
  resultComment: {
    ...TYPE.subtitle,
    textAlign: 'center',
    marginBottom: SPACING[6],
    color: COLORS.inkSecondary,
    fontSize: 16,
  },
  scorePanel: {
    width: '100%',
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.lg,
    padding: SPACING[6],
    marginBottom: SPACING[6],
    alignItems: 'center',
  },
  scorePct: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    marginBottom: SPACING[2],
  },
  scoreLine: {
    ...TYPE.caption,
    textAlign: 'center',
    marginBottom: SPACING[4],
    color: COLORS.inkSecondary,
  },
  scoreBarTrack: {
    width: '100%',
    height: 16,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.mutedSoft,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: 16,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  statRow: {
    width: '100%',
    flexDirection: 'row',
    gap: SPACING[2],
    marginTop: SPACING[4],
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[2],
    alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.inkSecondary, marginTop: 2 },
  redirectText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  redirectSecs: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.primary },
  redirectTrack: {
    width: '100%',
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.mutedSoft,
    overflow: 'hidden',
    marginBottom: SPACING[6],
  },
  redirectFill: {
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
});
