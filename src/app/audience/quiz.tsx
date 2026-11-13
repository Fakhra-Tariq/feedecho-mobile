import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import { QuizQuestionNavButtons } from '@/components/Audience/QuizQuestionNavButtons';
import { showAlert } from '@/components/feedback';
import { AppButton } from '@/components/ui';
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
  getStudentAttemptSecondsRemaining,
  isQuizJoinWindowExpired,
  resolveRegularQuizTimeLeft,
} from '@/lib/quizLaunchAudienceSettings';
import {
  getMyParticipation,
  hasGuestSubmitted,
  markQuizAttemptSubmitted,
  saveQuizAttemptProgress,
} from '@/lib/studentParticipation';
import { getPerformanceComment } from '@/lib/spaceRaceResultStats';
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

function remainingFromOriginalStart(quizData: any, startedAtIso?: string | null) {
  const settings = quizData?.launchSettings || {};
  if (settings.timePerStudentMinutes) {
    return getStudentAttemptSecondsRemaining(settings, startedAtIso);
  }
  if (settings.timeLimit != null) {
    const startMs = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const total = Number(settings.timeLimit) * 60;
    let remaining = Math.max(0, total - elapsed);
    if (settings.endTime) {
      const quizEndRemaining = Math.max(
        0,
        Math.floor((new Date(settings.endTime).getTime() - Date.now()) / 1000)
      );
      remaining = Math.min(remaining, quizEndRemaining);
    }
    return remaining;
  }
  return resolveRegularQuizTimeLeft(quizData, startedAtIso);
}

/**
 * Live audience quiz — same destination Web uses after join: /audience/quiz/:quizId.
 * Loads locked studentSession from join; submits via POST /quiz-submissions/{id}/submit.
 * Guests omit studentUid/studentEmail on submit (matches Web).
 */
export default function AudienceQuizScreen() {
  const { profile } = useAuth();
  const isGuest = Boolean(profile?.guest);
  const params = useLocalSearchParams<{ quizId?: string; alreadySubmitted?: string }>();
  const quizIdParam = String(params.quizId || '');
  const alreadySubmittedParam = String(params.alreadySubmitted || '') === '1';
  const isLoggedInStudent = Boolean(profile?.uid && !profile?.guest);
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
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef<Record<string, any>>({});
  const currentQuestionRef = useRef(0);
  const originalParticipantIdRef = useRef<string | null>(null);

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
        const targetQuizId = quizIdParam || String(stored?.quizId || '');
        let participation: Awaited<ReturnType<typeof getMyParticipation>> | null = null;
        if (isLoggedInStudent && profile?.uid && targetQuizId) {
          participation = await getMyParticipation('quiz', targetQuizId, String(profile.uid), {
            email: profile.email,
            name: profile.name,
          });
        }

        const openSubmitted = (quizData: any, result?: { percentage: number; correctAnswers: number; totalQuestions: number }) => {
          if (cancelled) return;
          setQuiz(
            quizData || {
              id: targetQuizId,
              title: 'Quiz',
              launchSettings: { showFinalScore: Boolean(result?.totalQuestions) },
            }
          );
          if (result) setResultScore(result);
          else {
            setResultScore({ percentage: 0, correctAnswers: 0, totalQuestions: 0 });
            setQuiz((prev: any) => ({
              ...(prev || {}),
              launchSettings: { ...(prev?.launchSettings || {}), showFinalScore: false },
            }));
          }
          setIsSubmitted(true);
        };

        if (isLoggedInStudent && (alreadySubmittedParam || participation?.status === 'submitted')) {
          const foundQuiz = stored?.quiz && String(stored.quizId) === String(targetQuizId) ? stored.quiz : null;
          if (foundQuiz && isQuizJoinWindowExpired(foundQuiz.launchSettings)) {
            if (!cancelled) setError('This quiz is no longer joinable.');
            return;
          }
          openSubmitted(
            foundQuiz
              ? {
                  ...foundQuiz,
                  id: foundQuiz.id || targetQuizId,
                  type: normalizeQuizTypeLabel(foundQuiz.type),
                  questions: normalizeQuestionsList(foundQuiz.questions),
                  launched: true,
                }
              : null,
            participation?.result
          );
          if (stored && String(stored.quizId) === String(targetQuizId)) setSession(stored);
          return;
        }

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
          !isLoggedInStudent &&
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

        const resume = isLoggedInStudent ? participation?.progress : undefined;
        const shuffleSeed = resume?.originalParticipantId || stored.participantId;
        let quizToUse = {
          ...foundQuiz,
          id: foundQuiz.id || stored.quizId,
          type: normalizeQuizTypeLabel(foundQuiz.type),
          questions: normalizeQuestionsList(foundQuiz.questions),
          launched: true,
        };
        quizToUse = applyQuizShuffleSettings(quizToUse, shuffleSeed);

        const startedAtIso = resume?.startedAt || stored.joinedAt;
        const startMs = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
        const restoredAnswers =
          resume?.answers && typeof resume.answers === 'object' ? { ...resume.answers } : {};
        const restoredIndex = Math.min(
          Math.max(0, Number(resume?.currentQuestion || 0)),
          Math.max(0, quizToUse.questions.length - 1)
        );

        if (!cancelled) {
          setSession(stored);
          setQuiz(quizToUse);
          setAnswers(restoredAnswers);
          answersRef.current = restoredAnswers;
          setCurrentQuestion(restoredIndex);
          currentQuestionRef.current = restoredIndex;
          originalParticipantIdRef.current = String(shuffleSeed || stored.participantId || '');
          const remaining = isLoggedInStudent
            ? remainingFromOriginalStart(quizToUse, startedAtIso)
            : resolveRegularQuizTimeLeft(quizToUse, stored.joinedAt);
          setTimeLeft(remaining);
          quizStartedAtRef.current = Number.isFinite(startMs) ? startMs : Date.now();
          if (isLoggedInStudent && profile?.uid && !resume) {
            void saveQuizAttemptProgress({
              quizId: String(stored.quizId),
              uid: String(profile.uid),
              status: 'in_progress',
              currentQuestion: 0,
              answers: {},
              startedAt: startedAtIso || new Date().toISOString(),
              originalParticipantId: stored.participantId,
            });
          }
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
  }, [
    quizIdParam,
    alreadySubmittedParam,
    isLoggedInStudent,
    profile?.uid,
    profile?.email,
    profile?.name,
  ]);

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

  const persistProgressSoon = (nextAnswers: Record<string, any>, nextIndex: number) => {
    if (!isLoggedInStudent || !profile?.uid || !quiz?.id || isSubmitted) return;
    if (progressSaveTimerRef.current) clearTimeout(progressSaveTimerRef.current);
    progressSaveTimerRef.current = setTimeout(() => {
      const startedAt = quizStartedAtRef.current
        ? new Date(quizStartedAtRef.current).toISOString()
        : new Date().toISOString();
      void saveQuizAttemptProgress({
        quizId: String(quiz.id),
        uid: String(profile.uid),
        status: 'in_progress',
        currentQuestion: nextIndex,
        answers: nextAnswers,
        startedAt,
        originalParticipantId: originalParticipantIdRef.current || session?.participantId || null,
      });
    }, 400);
  };

  const setAnswer = (value: any) => {
    if (!questionKey || isSubmitted || isSubmitting) return;
    setAnswers((prev) => {
      const next = { ...prev, [questionKey]: value };
      answersRef.current = next;
      persistProgressSoon(next, currentQuestionRef.current);
      return next;
    });
  };

  const currentAnswer =
    answers[questionKey] ??
    answers[String(questionKey)] ??
    answers[currentQuestion] ??
    answers[String(currentQuestion)] ??
    '';

  const hasAnyAnswer = () =>
    questions.some((q: any, index: number) => {
      const key = getStableQuestionId(q, index);
      const value = answers[key] ?? answers[String(key)] ?? answers[index] ?? answers[String(index)];
      return value != null && String(value).trim() !== '';
    });

  const onSubmit = async () => {
    if (!quiz || isSubmitting || isSubmitted) return;
    if (isLoggedInStudent && profile?.uid) {
      const part = await getMyParticipation('quiz', String(quiz.id), String(profile.uid), {
        email: profile.email,
        name: profile.name,
      });
      if (part.status === 'submitted') {
        if (part.result) setResultScore(part.result);
        else setResultScore({ percentage: 0, correctAnswers: 0, totalQuestions: quiz.questions?.length || 0 });
        setIsSubmitted(true);
        return;
      }
    }
    if (isGuest) {
      const guestName = session?.studentName || profile?.name || '';
      try {
        if (guestName && (await hasGuestSubmitted('quiz', String(quiz.id), guestName))) {
          return;
        }
      } catch (checkErr) {
        console.warn('[guest submit check] network error, allowing submit', checkErr);
      }
    }
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
      if (isLoggedInStudent && profile?.uid) {
        await markQuizAttemptSubmitted(String(profile.uid), String(quiz.id));
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

  if (!isSubmitted && (error || !quiz || questions.length === 0)) {
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

  if (isSubmitted) {
    const displayScore = resultScore?.correctAnswers ?? 0;
    const displayTotal = resultScore?.totalQuestions ?? 0;
    const displayPercentage = Math.round(resultScore?.percentage ?? 0);
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

  const hostLabel = String(
    quiz.createdByName || quiz.hostName || quiz.teacherName || session?.studentName || 'Audience'
  ).trim();
  const optionLabels: string[] =
    effectiveType === 'True / False'
      ? ['True', 'False']
      : (question?.options || []).map(optionText);
  const canSubmit = hasAnyAnswer() && !isSubmitting;

  return (
    <KeyboardSafeScreen
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
      <GuestProgressLoginBanner visible={isGuest} />

      <View style={styles.metaLine}>
        <Text style={styles.metaTitle} numberOfLines={2}>
          {quiz.title}
        </Text>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{quiz.type || 'Quiz'}</Text>
        </View>
        <Text style={styles.metaHost} numberOfLines={1}>
          {hostLabel}
        </Text>
      </View>

      {timeLeft != null ? (
        <View style={styles.timerRow}>
          <Ionicons name="time-outline" size={16} color={COLORS.primary} />
          <Text style={styles.timerText}>Time remaining: {formatCountdown(timeLeft)}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            Question {currentQuestion + 1} of {questions.length}
          </Text>
          <Text style={styles.progressPct}>{Math.round(progress)}% Complete</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>

        <View style={styles.questionRow}>
          <View style={styles.qBadge}>
            <Text style={styles.qBadgeText}>{currentQuestion + 1}</Text>
          </View>
          <Text style={styles.questionText}>{question?.questionText || question?.text || ''}</Text>
        </View>

        {effectiveType === 'Multiple Choice' || effectiveType === 'True / False' ? (
          <View style={styles.options}>
            {optionLabels.map((opt: string) => {
              const selected = String(currentAnswer) === String(opt);
              return (
                <Pressable
                  key={opt}
                  onPress={() => setAnswer(opt)}
                  style={[styles.option, selected && styles.optionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}>
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {opt}
                  </Text>
                </Pressable>
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

        <QuizQuestionNavButtons
          previousDisabled={currentQuestion === 0}
          onPrevious={() => {
            setCurrentQuestion((i) => {
              const next = Math.max(0, i - 1);
              currentQuestionRef.current = next;
              persistProgressSoon(answersRef.current, next);
              return next;
            });
          }}
          primaryLabel={
            currentQuestion < questions.length - 1
              ? 'Next'
              : isSubmitting
                ? 'Submitting...'
                : 'Submit Quiz'
          }
          onPrimary={
            currentQuestion < questions.length - 1
              ? () => {
                  setCurrentQuestion((i) => {
                    const next = Math.min(questions.length - 1, i + 1);
                    currentQuestionRef.current = next;
                    persistProgressSoon(answersRef.current, next);
                    return next;
                  });
                }
              : onSubmit
          }
          primaryDisabled={currentQuestion >= questions.length - 1 && (!canSubmit || isSubmitted)}
          primaryBusy={currentQuestion >= questions.length - 1 && isSubmitting}
          showTrailingArrow={currentQuestion < questions.length - 1}
          showSendIcon={currentQuestion >= questions.length - 1 && !isSubmitting}
        />
      </View>
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
  content: { padding: SPACING[4], gap: SPACING[3], paddingBottom: SPACING[16] },
  metaLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING[2],
  },
  metaTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  typePill: {
    backgroundColor: COLORS.blush,
    borderRadius: 20,
    paddingHorizontal: SPACING[2],
    paddingVertical: 2,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.primary,
  },
  metaHost: { fontSize: 13, color: COLORS.darkTextSecondary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    ...SHADOWS.raised,
  },
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
  questionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
    marginBottom: SPACING[4],
  },
  qBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qBadgeText: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  questionText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 24,
  },
  options: { gap: SPACING[2] },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
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
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.iconMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: COLORS.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  optionText: { flex: 1, color: COLORS.text, fontSize: 15 },
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
