import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudienceActivityHeader } from '@/components/Audience/AudienceActivityHeader';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import {
  SPACE_RACE_FAB_BOTTOM_PAD,
  SpaceRaceTeamChatFab,
} from '@/components/Audience/SpaceRaceTeamChatFab';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { showAlert } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { normalizeQuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  appendActivityEntrySource,
  useLeaveActivity,
} from '@/lib/audienceHomeNavigation';
import { getFinalScore, getPublicSpaceRaceById, setTeamSelection, submitRaceAnswer } from '@/lib/hostSpaceRaces';
import {
  bootstrapSpaceRaceQuiz,
  normalizeQuestionList,
  teamQuizCacheKey,
} from '@/lib/spaceRaceAudienceQuiz';
import { loadSpaceRaceParticipant, saveSpaceRaceParticipant } from '@/lib/spaceRaceSession';
import {
  getRaceStatus,
  isSubmittedLockNode,
  spaceRaceQuestionId,
  spaceRaceQuestionIdAliases,
  teamScoreFromNode,
} from '@/lib/spaceRaceTeams';
import { useRtdbValue } from '@/lib/useRtdb';

function isLoggedInAudience(
  profile: { guest?: boolean; uid?: string; email?: string } | null,
  user: { uid?: string; email?: string | null } | null
) {
  if (profile?.guest) return false;
  const uid = user?.uid || profile?.uid;
  const email = user?.email || profile?.email;
  return Boolean(uid && email);
}

function pickQuestionLockNode(nodes: any[]) {
  const submitted = nodes.filter(isSubmittedLockNode);
  if (submitted.length) {
    const withAnswer = submitted.find((node) => {
      const value = node?.selectedOption ?? node?.answer;
      return value != null && String(value).trim() !== '';
    });
    return withAnswer || submitted[0];
  }
  return nodes.find((node) => node && typeof node === 'object') || null;
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

function formatQuizCountdown(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--';
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getPerformanceComment(percentage: number) {
  if (percentage >= 90) return "Outstanding! You're a star performer! 🌟";
  if (percentage >= 80) return "Excellent work! You really know your stuff! 🎯";
  if (percentage >= 65) return 'Great job! Keep up the good work! 👏';
  if (percentage >= 50) return 'Good effort! Room for improvement! 💪';
  if (percentage >= 35) return 'Nice try! Keep practicing! 📚';
  return "Keep learning! You'll do better next time! 🌱";
}

export default function AudienceSpaceRaceQuizScreen() {
  const { profile, user } = useAuth();
  const { source, leave } = useLeaveActivity({ headerBack: false });
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ raceId?: string; teamId?: string }>();
  const raceId = String(params.raceId || '');
  const paramTeamId = Number(params.teamId || 0);
  const [participant, setParticipant] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<any>('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [quizLoading, setQuizLoading] = useState(true);
  const [quizLoadError, setQuizLoadError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [quizTimeExpired, setQuizTimeExpired] = useState(false);
  const [raceEnded, setRaceEnded] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(10);
  const [answersById, setAnswersById] = useState<Record<string, any>>({});
  const [localLock, setLocalLock] = useState<Record<string, any>>({});
  const loadGen = useRef(0);

  const loggedIn = isLoggedInAudience(profile, user);
  const teamId = Number(participant?.teamId || paramTeamId || 0);

  const { value: race } = useRtdbValue(raceId ? `spaceRaces/${raceId}` : null, {
    enabled: Boolean(raceId),
  });
  const { value: teamScoreNode } = useRtdbValue(
    raceId && teamId ? `space_race_team_scores/${raceId}/team_${teamId}` : null,
    { enabled: Boolean(raceId && teamId) }
  );
  const { value: teamTimer } = useRtdbValue(
    raceId && teamId ? `space_race_team_timers/${raceId}/team_${teamId}` : null,
    { enabled: Boolean(raceId && teamId) }
  );
  const { value: liveTeamSelections } = useRtdbValue(
    raceId && teamId ? `space_race_team_selection/${raceId}/team_${teamId}` : null,
    { enabled: Boolean(raceId && teamId) }
  );

  const questions = useMemo(() => {
    if (Array.isArray(quiz?.questions)) return quiz.questions;
    return normalizeQuestionList(quiz?.questions);
  }, [quiz]);

  const question = questions[index];
  const questionId = question ? spaceRaceQuestionId(question, index) : '';
  const questionAliases = useMemo(
    () => (question ? spaceRaceQuestionIdAliases(question, index) : []),
    [question, index]
  );
  const lockNode = useMemo(() => {
    const nodes: any[] = [];
    questionAliases.forEach((id) => {
      const live = liveTeamSelections?.[`question_${id}`];
      if (live) nodes.push(live);
      if (localLock[id]) nodes.push(localLock[id]);
    });
    return pickQuestionLockNode(nodes);
  }, [questionAliases, liveTeamSelections, localLock]);
  const submitted = isSubmittedLockNode(lockNode);
  const displaySelectedOption = lockNode?.selectedOption ?? lockNode?.answer ?? answer;
  const selectedByName = lockNode?.submittedByName || lockNode?.selectedByName || '';

  const headerTitle = useMemo(() => {
    const candidates = [
      quiz?.title,
      race?.quiz?.title,
      race?.quizTitle,
      race?.quiz?.name,
      race?.title,
    ];
    for (const value of candidates) {
      if (value && String(value).trim()) return String(value).trim();
    }
    return 'Quiz';
  }, [quiz, race]);

  const headerName = (participant?.name || profile?.name || 'Audience').trim();
  const showGuestChrome =
    participant?.joinedAsGuest === true ||
    (participant != null && participant.joinedAsGuest !== false && !loggedIn && !participant.studentUid);

  useEffect(() => {
    loadSpaceRaceParticipant(raceId).then((p) => {
      if (p) setParticipant(p);
    });
  }, [raceId]);

  useEffect(() => {
    if (getRaceStatus(race) === 'completed') setRaceEnded(true);
  }, [race]);

  useEffect(() => {
    if (!raceId) {
      setQuizLoading(false);
      return;
    }
    const gen = ++loadGen.current;
    let cancelled = false;
    const run = async () => {
      setQuizLoading(true);
      setQuizLoadError('');
      try {
        const stored = await loadSpaceRaceParticipant(raceId);
        const pid = stored?.id || participant?.id;
        const tid = stored?.teamId ?? participant?.teamId ?? paramTeamId;
        let raceData: any = null;
        try {
          raceData = await getPublicSpaceRaceById(raceId);
        } catch (err) {
          if (gen !== loadGen.current || cancelled) return;
          setQuizLoadError(cleanErrorMessage(err, 'Could not load this race.'));
        }
        if (gen !== loadGen.current || cancelled) return;

        const apply = (quizData: any, skipShuffle: boolean, settings?: any) => {
          const prepared = bootstrapSpaceRaceQuiz({
            quizData,
            raceId,
            teamId: tid,
            participantId: pid,
            raceSettings: settings,
            skipShuffle,
          });
          setQuiz(prepared);
          AsyncStorage.setItem(teamQuizCacheKey(tid), JSON.stringify(prepared)).catch(() => {});
        };

        if (raceData?.quiz) {
          apply(
            {
              ...raceData.quiz,
              id: raceData.quizId || raceData.quiz.id,
            },
            false,
            raceData.settings
          );
        } else {
          const cacheKey = teamQuizCacheKey(tid);
          const cachedRaw = await AsyncStorage.getItem(cacheKey);
          if (cachedRaw) {
            apply(JSON.parse(cachedRaw), true, raceData?.settings);
          } else {
            setQuiz({ questions: [] });
          }
        }
      } catch (err) {
        if (gen !== loadGen.current || cancelled) return;
        setQuizLoadError(cleanErrorMessage(err, 'Could not load quiz questions.'));
        setQuiz({ questions: [] });
      } finally {
        if (gen === loadGen.current && !cancelled) setQuizLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [raceId, paramTeamId]);

  useEffect(() => {
    const endIso = teamTimer?.endTime;
    if (!endIso || finished) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(endIso).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && teamTimer?.quizStartedAt) setQuizTimeExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [teamTimer?.endTime, teamTimer?.quizStartedAt, finished]);

  useEffect(() => {
    const liveAnswer = lockNode?.selectedOption ?? lockNode?.answer;
    if (liveAnswer != null && String(liveAnswer) !== '') setAnswer(liveAnswer);
    else if (questionId && answersById[questionId] != null) setAnswer(answersById[questionId]);
    else setAnswer('');
  }, [lockNode, index, questionId]);

  useEffect(() => {
    if (!finished) return undefined;
    setRedirectCountdown(10);
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [finished]);

  useEffect(() => {
    if (finished && redirectCountdown === 0) {
      router.replace(
        appendActivityEntrySource(`/audience/space-race?raceId=${raceId}`, source) as Href
      );
    }
  }, [finished, redirectCountdown, raceId, source]);

  const teamScore = teamScoreFromNode(teamScoreNode);
  const timerBlocksSubmit = quizTimeExpired || raceEnded;
  const showFinalScore = Boolean(
    quiz?.launchSettings?.spaceRaceSettings?.showFinalScore ||
      quiz?.spaceRaceSettings?.showFinalScore
  );

  const optionList = () => {
    if (!question) return [] as string[];
    const effective = getEffectiveQuestionType(quiz?.type, question);
    if (effective === 'True / False' || String(question.type || '').toLowerCase().includes('true')) {
      return ['True', 'False'];
    }
    if (Array.isArray(question.options)) return question.options.map(optionText).filter(Boolean);
    return [];
  };

  const applyLocalLock = (id: string, node: any) => {
    setLocalLock((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...node, submitted: true },
    }));
  };

  const onSelect = async (value: any) => {
    if (timerBlocksSubmit || submitted) return;
    setAnswer(value);
    if (questionId) {
      setAnswersById((prev) => ({ ...prev, [questionId]: value }));
    }
    if (!participant?.id || !questionId) return;
    try {
      await setTeamSelection(raceId, {
        teamId,
        questionId,
        selectedOption: value,
        participantId: String(participant.id),
        participantName: participant.name,
      });
    } catch {
      // selection sync best-effort
    }
  };

  const goToLobby = () => {
    router.replace(
      appendActivityEntrySource(`/audience/space-race?raceId=${raceId}`, source) as Href
    );
  };

  const finishQuiz = async () => {
    setFinished(true);
    if (!participant?.id) return;
    try {
      const scoreRes: any = await getFinalScore(raceId, {
        teamId,
        participantId: String(participant.id),
      });
      const score =
        scoreRes?.data?.score ?? scoreRes?.score ?? teamScore ?? participant?.score ?? 0;
      setFinalScore(Number(score) || 0);
      const updated = { ...participant, score: Number(score) || 0 };
      setParticipant(updated);
      await saveSpaceRaceParticipant(updated);
    } catch {
      setFinalScore(teamScore);
    }
  };

  const onSubmit = async () => {
    if (!participant?.id || !question || busy) return;
    if (timerBlocksSubmit) {
      setQuizTimeExpired(true);
      return;
    }
    if (submitted) return;
    const answerToSend =
      (answer !== '' && answer != null ? answer : displaySelectedOption) ?? '';
    if (answerToSend === '' || answerToSend == null || !String(answerToSend).trim()) {
      showAlert({
        type: 'warning',
        title: 'Answer required',
        message: 'Select or enter an answer first.',
        primary: { label: 'Close' },
      });
      return;
    }

    const submittedSelection = {
      selectedOption: answerToSend,
      submitted: true,
      submittedBy: String(participant.id),
      submittedByName: participant.name || 'A teammate',
      selectedByName: participant.name || 'A teammate',
    };
    applyLocalLock(questionId, submittedSelection);
    questionAliases.forEach((id) => applyLocalLock(id, submittedSelection));

    setBusy(true);
    try {
      const response = await submitRaceAnswer(raceId, {
        teamId,
        questionId,
        answer: answerToSend,
        participantId: String(participant.id),
        participantName: participant.name,
        questionIndex: index,
      });
      if ((response as any)?.expired) {
        setQuizTimeExpired(true);
        return;
      }
      if (!response.success && response.error) {
        throw new Error(response.error);
      }
      try {
        await setTeamSelection(raceId, {
          teamId,
          questionId,
          selectedOption: answerToSend,
          participantId: String(participant.id),
          participantName: participant.name,
          submitted: true,
          submittedByName: participant.name || 'A teammate',
        });
      } catch {
        // submit-answer already wrote the lock
      }
    } catch (err) {
      const data = (err as any)?.data as { expired?: boolean; error?: string } | undefined;
      if (data?.expired) {
        setQuizTimeExpired(true);
        return;
      }
      const errMsg = String(data?.error || (err as Error)?.message || '');
      if (errMsg.toLowerCase().includes('already submitted')) {
        applyLocalLock(questionId, submittedSelection);
        return;
      }
      setLocalLock((prev) => {
        const next = { ...prev };
        questionAliases.forEach((id) => {
          if (next[id]) next[id] = { ...next[id], submitted: false };
        });
        return next;
      });
      showAlert({
        type: 'error',
        title: 'Submit failed',
        message: cleanErrorMessage(err, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  const chrome = (
    <>
      <AudienceActivityHeader
        title={headerTitle}
        titleIcon="rocket"
        participantName={headerName}
        isLoggedIn={!showGuestChrome && loggedIn}
        onLogoPress={leave}
      />
      <GuestProgressLoginBanner visible={showGuestChrome} />
    </>
  );

  const fab = (
    <SpaceRaceTeamChatFab raceId={raceId} teamId={teamId} participant={participant} />
  );

  const resultShell = (body: ReactNode) => (
    <View style={styles.screen}>
      {chrome}
      <ScrollView
        contentContainerStyle={[
          styles.centeredScroll,
          { paddingBottom: SPACE_RACE_FAB_BOTTOM_PAD + insets.bottom + SPACING[4] },
        ]}>
        {body}
      </ScrollView>
      {fab}
    </View>
  );

  if (quizLoading) {
    return (
      <View style={styles.screen}>
        {chrome}
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.hint}>Loading quiz...</Text>
        </View>
      </View>
    );
  }

  if (raceEnded && !finished) {
    return resultShell(
      <View style={styles.resultCard}>
        <Ionicons name="flag" size={56} color={COLORS.primary} />
        <Text style={styles.heading}>Race ended</Text>
        <Text style={styles.hint}>
          This Space Race has been ended by the host. You can no longer submit answers.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={goToLobby}>
          <Text style={styles.primaryLabel}>Back to Race</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (quizTimeExpired && !finished) {
    return resultShell(
      <View style={styles.resultCard}>
        <Ionicons name="time-outline" size={56} color="#DC2626" />
        <Text style={styles.heading}>Time's Up</Text>
        <Text style={styles.hint}>
          This quiz is closed. Your team&apos;s time has ended, so it can no longer be opened or
          attempted.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={goToLobby}>
          <Text style={styles.primaryLabel}>Back to Race</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (quizLoadError && questions.length === 0) {
    return resultShell(
      <View style={styles.resultCard}>
        <Ionicons name="alert-circle" size={56} color={COLORS.inkSecondary} />
        <Text style={styles.heading}>Quiz Error</Text>
        <Text style={styles.hint}>{quizLoadError}</Text>
        <TouchableOpacity style={styles.primary} onPress={goToLobby}>
          <Text style={styles.primaryLabel}>Back to Race</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (finished) {
    const totalQuestionsCount = questions.length;
    const displayScore = finalScore ?? teamScore;
    const displayPercentage =
      totalQuestionsCount > 0
        ? Math.round((Number(displayScore) / totalQuestionsCount) * 100)
        : 0;

    if (!showFinalScore) {
      return resultShell(
        <View style={styles.resultCard}>
          <Ionicons name="checkmark-circle" size={72} color={COLORS.primary} />
          <Text style={styles.heading}>Space Race Quiz Completed!</Text>
          <Text style={styles.hint}>Thank you for completing the quiz!</Text>
          <Text style={styles.hint}>
            Redirecting back to Space Race in{' '}
            <Text style={styles.score}>{redirectCountdown}</Text> seconds...
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(redirectCountdown / 10) * 100}%` }]} />
          </View>
          <TouchableOpacity style={styles.primary} onPress={goToLobby}>
            <Text style={styles.primaryLabel}>Back to Space Race</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return resultShell(
      <View style={styles.resultCard}>
        <View style={styles.scoreCircle}>
          <Ionicons name="checkmark-circle" size={40} color={COLORS.primary} />
        </View>
        <Text style={styles.heading}>Space Race Quiz Completed!</Text>
        <Text style={styles.hint}>{getPerformanceComment(displayPercentage)}</Text>
        <View style={styles.scoreBox}>
          <Text style={styles.percentHuge}>{displayPercentage}%</Text>
          <Text style={styles.hint}>
            Your team scored {displayPercentage}% ({displayScore} of {totalQuestionsCount} correct)
          </Text>
          <View style={styles.progressTrackTall}>
            <View style={[styles.progressFillTall, { width: `${displayPercentage}%` }]} />
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{displayScore}</Text>
              <Text style={styles.statLabel}>Correct</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>
                {Math.max(0, totalQuestionsCount - Number(displayScore || 0))}
              </Text>
              <Text style={styles.statLabel}>Incorrect</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statNum}>{totalQuestionsCount}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>
        <Text style={styles.hint}>
          Redirecting back to Space Race in <Text style={styles.score}>{redirectCountdown}</Text>{' '}
          seconds...
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(redirectCountdown / 10) * 100}%` }]} />
        </View>
        <TouchableOpacity style={styles.primary} onPress={goToLobby}>
          <Text style={styles.primaryLabel}>Back to Space Race</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!question) {
    return resultShell(
      <View style={styles.resultCard}>
        <Ionicons name="alert-circle" size={56} color={COLORS.inkSecondary} />
        <Text style={styles.heading}>Quiz Not Available</Text>
        <Text style={styles.hint}>This quiz is not currently available.</Text>
        <TouchableOpacity style={styles.primary} onPress={goToLobby}>
          <Text style={styles.primaryLabel}>Back to Race</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const options = optionList();
  const effectiveType = getEffectiveQuestionType(quiz?.type, question);
  const isWritten =
    effectiveType === 'Short Answer' ||
    effectiveType === 'Long Answer' ||
    String(question.type || '').toLowerCase().includes('short') ||
    String(question.type || '').toLowerCase().includes('long') ||
    (options.length === 0 &&
      !String(effectiveType).toLowerCase().includes('multiple') &&
      !String(effectiveType).toLowerCase().includes('true'));
  const answeredCount = questions.filter((q: any, qIndex: number) => {
    const id = spaceRaceQuestionId(q, qIndex);
    const stored = answersById[id];
    if (qIndex === index && (answer != null && String(answer).trim() !== '')) return true;
    return stored != null && String(stored).trim() !== '';
  }).length;
  const progressPct = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const submittedByName = selectedByName || 'A teammate';
  const hasAnswer =
    (answer !== '' && answer != null && String(answer).trim() !== '') ||
    (displaySelectedOption != null && String(displaySelectedOption).trim() !== '');
  const prompt =
    question.questionText || question.text || question.prompt || question.question || '';

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      {chrome}
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              SPACE_RACE_FAB_BOTTOM_PAD + insets.bottom + SPACING[8] + KEYBOARD_BOTTOM_GAP,
          },
        ]}>
        {timeLeft != null ? (
          <View style={styles.timerBanner}>
            <View style={styles.timerLeft}>
              <Ionicons name="time-outline" size={16} color={COLORS.primary} />
              <Text style={styles.timerLabel}>Quiz duration timer</Text>
            </View>
            <Text style={[styles.timerValue, timeLeft < 60 && styles.timerUrgent]}>
              Time remaining: {formatQuizCountdown(timeLeft)}
            </Text>
          </View>
        ) : null}

        <View style={styles.questionCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressMeta}>
              Question {index + 1} of {questions.length}
            </Text>
            <Text style={styles.progressPct}>{Math.round(progressPct)}% Complete</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          <View style={styles.promptRow}>
            <View style={styles.numBadge}>
              <Text style={styles.numBadgeText}>{index + 1}</Text>
            </View>
            <Text style={styles.prompt}>{prompt}</Text>
          </View>

          {submitted ? (
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText}>
                🔒 Answer submitted by <Text style={styles.lockedStrong}>{submittedByName}</Text>
              </Text>
              <Text style={styles.lockedSub}>Click Next to continue</Text>
            </View>
          ) : null}

          {!submitted &&
          displaySelectedOption != null &&
          String(displaySelectedOption).trim() !== '' ? (
            <View style={styles.teamPickBox}>
              <Text style={styles.teamPickText}>
                Team selected:{' '}
                <Text style={styles.teamPickStrong}>{String(displaySelectedOption)}</Text>
                {selectedByName ? ` (${selectedByName})` : ''}
              </Text>
            </View>
          ) : null}

          {isWritten ? (
            <TextInput
              value={String(answer ?? '')}
              onChangeText={onSelect}
              editable={!submitted && !timerBlocksSubmit}
              placeholder="Enter your answer..."
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
              multiline
            />
          ) : (
            options.map((option: string) => {
              const selected = String(displaySelectedOption ?? answer) === String(option);
              return (
                <TouchableOpacity
                  key={String(option)}
                  style={[
                    styles.option,
                    selected && styles.optionOn,
                    submitted && styles.optionLocked,
                  ]}
                  disabled={submitted || timerBlocksSubmit}
                  onPress={() => onSelect(option)}>
                  <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}

          {!submitted ? (
            <TouchableOpacity
              style={[
                styles.primary,
                styles.fullWidth,
                (busy || !hasAnswer || timerBlocksSubmit) && styles.disabled,
              ]}
              onPress={onSubmit}
              disabled={busy || !hasAnswer || timerBlocksSubmit}>
              <Text style={styles.primaryLabel}>
                {busy ? 'Submitting...' : '🚀 Submit Answer for Team'}
              </Text>
            </TouchableOpacity>
          ) : index === questions.length - 1 ? (
            <TouchableOpacity
              style={[styles.primary, styles.fullWidth]}
              onPress={finishQuiz}>
              <Text style={styles.primaryLabel}>Finish</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primary, styles.fullWidth]}
              onPress={() => setIndex((prev) => prev + 1)}>
              <Text style={styles.primaryLabel}>Next →</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.prevBtn, index === 0 && styles.prevBtnOff]}
            onPress={() => setIndex((prev) => Math.max(0, prev - 1))}
            disabled={index === 0}>
            <Ionicons
              name="arrow-back"
              size={16}
              color={index === 0 ? COLORS.mutedText : COLORS.primary}
            />
            <Text style={[styles.prevLabel, index === 0 && styles.prevLabelOff]}>Previous</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {fab}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING[6],
    gap: SPACING[3],
    backgroundColor: COLORS.background,
  },
  centeredScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING[4],
  },
  resultCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[6],
    alignItems: 'center',
    gap: SPACING[3],
  },
  content: { padding: SPACING[4], gap: SPACING[3] },
  timerBanner: {
    backgroundColor: COLORS.blush,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  timerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  timerLabel: { color: COLORS.primary, fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  timerValue: { color: '#15803D', fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  timerUrgent: { color: '#DC2626' },
  questionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    gap: SPACING[3],
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  progressMeta: { fontSize: 13, color: COLORS.inkSecondary },
  progressPct: { fontSize: 13, fontWeight: FONT_WEIGHTS.medium, color: COLORS.primary },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.mutedSoft,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  progressTrackTall: {
    height: 16,
    borderRadius: 999,
    backgroundColor: COLORS.mutedSoft,
    overflow: 'hidden',
    width: '100%',
    marginTop: SPACING[2],
  },
  progressFillTall: {
    height: 16,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  promptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING[3] },
  numBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numBadgeText: { fontWeight: FONT_WEIGHTS.semibold, fontSize: 14, color: COLORS.primary },
  prompt: {
    flex: 1,
    minWidth: 0,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 22,
  },
  lockedBox: {
    backgroundColor: '#f5eef2',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING[3],
    gap: 4,
  },
  lockedText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 13, lineHeight: 18 },
  lockedStrong: { fontWeight: FONT_WEIGHTS.bold },
  lockedSub: { color: COLORS.primary, fontSize: 12, opacity: 0.8 },
  teamPickBox: {
    backgroundColor: COLORS.blush,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: SPACING[3],
  },
  teamPickText: { fontSize: 13, color: COLORS.text },
  teamPickStrong: { fontWeight: FONT_WEIGHTS.bold, color: COLORS.primary },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    minHeight: 88,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.white,
    textAlignVertical: 'top',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#d4d4d4',
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.white,
  },
  optionOn: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.blush },
  optionLocked: { opacity: 0.5, borderColor: '#e5e5e5', backgroundColor: '#f9fafb' },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d4d4d4',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  radioOuterOn: { borderColor: COLORS.primary },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  optionLabel: { flex: 1, minWidth: 0, color: COLORS.text },
  optionLabelOn: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[1],
    width: '100%',
    paddingHorizontal: SPACING[4],
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.6 },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: FONT_WEIGHTS.bold, textAlign: 'center' },
  score: { color: COLORS.primary, fontSize: 16, fontWeight: FONT_WEIGHTS.bold },
  hint: { color: COLORS.darkTextSecondary, textAlign: 'center' },
  percentHuge: { color: COLORS.primary, fontSize: 40, fontWeight: FONT_WEIGHTS.bold },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBox: {
    width: '100%',
    backgroundColor: COLORS.blush,
    borderRadius: 16,
    padding: SPACING[4],
    alignItems: 'center',
    gap: SPACING[2],
  },
  statGrid: { flexDirection: 'row', width: '100%', gap: SPACING[2], marginTop: SPACING[2] },
  statCell: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 10,
    padding: SPACING[2],
    alignItems: 'center',
  },
  statNum: { fontSize: 22, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.inkSecondary },
  prevBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prevBtnOff: {
    borderColor: COLORS.muted,
    backgroundColor: COLORS.mutedSoft,
  },
  prevLabel: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium },
  prevLabelOff: { color: COLORS.mutedText },
});
