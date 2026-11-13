import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudienceActivityHeader } from '@/components/Audience/AudienceActivityHeader';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import { QuizQuestionNavButtons } from '@/components/Audience/QuizQuestionNavButtons';
import {
  SPACE_RACE_FAB_BOTTOM_PAD,
  SpaceRaceTeamChatFab,
} from '@/components/Audience/SpaceRaceTeamChatFab';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { showAlert, showToast } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { normalizeQuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import {
  getPerformanceComment,
  spaceRaceResultStats,
  type SpaceRaceFinalScoreApi,
} from '@/lib/spaceRaceResultStats';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  appendActivityEntrySource,
  useLeaveActivity,
} from '@/lib/audienceHomeNavigation';
import {
  getFinalScore,
  getPublicSpaceRaceById,
  getTeamSelection,
  setTeamSelection,
  submitRaceAnswer,
} from '@/lib/hostSpaceRaces';
import {
  bootstrapSpaceRaceQuiz,
  normalizeQuestionList,
  readSpaceRaceQuizOptions,
  teamQuizCacheKey,
} from '@/lib/spaceRaceAudienceQuiz';
import { loadSpaceRaceParticipant, saveSpaceRaceParticipant } from '@/lib/spaceRaceSession';
import {
  findLiveQuestionNodes,
  getRaceStatus,
  isSubmittedLockNode,
  optionMatchesSelection,
  spaceRaceQuestionId,
  spaceRaceLiveQuestionKeys,
  spaceRaceQuestionIdAliases,
  teamNodeAnswer,
  teamScoreFromNode,
} from '@/lib/spaceRaceTeams';
import { nodesFromSnapshot, useLiveTeamSelectionMap } from '@/lib/useLiveTeamSelection';
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

/** Prefer a submitted node over a stale unsubmitted snapshot of the same question. */
function mergeTeamSelectionMaps(hooked: Record<string, any>, fromTree: Record<string, any>) {
  const out: Record<string, any> = { ...hooked };
  Object.entries(fromTree).forEach(([key, node]) => {
    const existing = out[key];
    if (isSubmittedLockNode(existing) && !isSubmittedLockNode(node)) return;
    out[key] = node;
  });
  return out;
}

function teammateDisplayName(participant: any, profile: any) {
  const name = String(participant?.name || profile?.name || '').trim();
  return name || 'A teammate';
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
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function remainingSecondsUntil(endIso: unknown, nowMs: number) {
  if (!endIso) return null;
  const end = new Date(String(endIso)).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

function isQuizDurationLimited(seconds: unknown) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0;
}

function QuizTimerPill({
  seconds,
  pulse,
  compact,
}: {
  seconds: number;
  pulse: Animated.Value;
  compact?: boolean;
}) {
  const critical = seconds <= 10;
  const warning = seconds <= 60 && !critical;
  return (
    <Animated.View
      style={[
        styles.timerPill,
        warning && styles.timerPillWarn,
        critical && styles.timerPillCrit,
        critical && { opacity: pulse },
      ]}>
      <Ionicons
        name="time-outline"
        size={compact ? 13 : 14}
        color={critical ? '#DC2626' : warning ? '#B45309' : COLORS.primary}
      />
      <Text
        style={[
          styles.timerPillText,
          compact && styles.timerPillTextCompact,
          warning && styles.timerPillTextWarn,
          critical && styles.timerPillTextCrit,
        ]}
        numberOfLines={1}>
        {formatQuizCountdown(seconds)}
      </Text>
    </Animated.View>
  );
}

function firstRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value || '';
}

function normalizeSharedTeamId(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(Array.isArray(value) ? value[0] : value).trim();
  if (!text || text === 'NaN' || text === 'undefined' || text === 'null') return null;
  return text;
}

function readLockAnswer(node: any) {
  return teamNodeAnswer(node);
}

function questionHasTeamAnswer(
  question: any,
  qIndex: number,
  liveMap: Record<string, any> | null | undefined,
  localLock: Record<string, any>,
  answersById: Record<string, any>
) {
  const nodes = findLiveQuestionNodes(liveMap, question, qIndex);
  if (nodes.some((node) => readLockAnswer(node).trim() !== '')) return true;
  const ids = spaceRaceQuestionIdAliases(question, qIndex);
  return ids.some((id) => {
    const live = liveMap?.[`question_${id}`];
    const value =
      readLockAnswer(live) ||
      localLock[id]?.selectedOption ||
      localLock[id]?.answer ||
      answersById[id];
    return value != null && String(value).trim() !== '';
  });
}

function participantAnswerForQuestion(
  answers: any[] | undefined,
  question: any,
  qIndex: number,
  questionId: string
) {
  if (!Array.isArray(answers)) return null;
  const ids = new Set(spaceRaceQuestionIdAliases(question, qIndex));
  if (questionId) ids.add(questionId);
  return (
    answers.find((row) => {
      if (!row || row.questionId == null) return false;
      return ids.has(String(row.questionId));
    }) || null
  );
}

export default function AudienceSpaceRaceQuizScreen() {
  const { profile, user } = useAuth();
  const { source, leave } = useLeaveActivity({ headerBack: false });
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const compactProgressRow = windowWidth < 390;
  const params = useLocalSearchParams<{ raceId?: string; teamId?: string }>();
  const raceId = String(firstRouteParam(params.raceId) || '');
  const paramTeamIdRaw = firstRouteParam(params.teamId);
  const paramTeamId = Number(paramTeamIdRaw || 0);
  const [participant, setParticipant] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<any>('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [finalApi, setFinalApi] = useState<SpaceRaceFinalScoreApi | null>(null);
  const [quiz, setQuiz] = useState<any>(null);
  const [quizLoading, setQuizLoading] = useState(true);
  const [quizLoadError, setQuizLoadError] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [quizTimeExpired, setQuizTimeExpired] = useState(false);
  const [raceEnded, setRaceEnded] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(10);
  const [answersById, setAnswersById] = useState<Record<string, any>>({});
  const [localLock, setLocalLock] = useState<Record<string, any>>({});
  const [submittedQuestionKeys, setSubmittedQuestionKeys] = useState<Set<string>>(() => new Set());
  const loadGen = useRef(0);
  const submittedRef = useRef(false);

  const loggedIn = isLoggedInAudience(profile, user);
  const participantId = participant?.id ? String(participant.id) : '';

  const questions = useMemo(() => {
    if (Array.isArray(quiz?.questions)) return quiz.questions;
    return normalizeQuestionList(quiz?.questions);
  }, [quiz]);

  const question = questions[index];
  const questionId = question ? spaceRaceQuestionId(question, index) : '';
  const liveQuestionKeys = useMemo(
    () => (question ? spaceRaceLiveQuestionKeys(question, index) : []),
    [question, index]
  );

  const { value: race } = useRtdbValue(raceId ? `spaceRaces/${raceId}` : null, {
    enabled: Boolean(raceId),
  });
  const { value: liveParticipantData } = useRtdbValue(
    raceId && participantId ? `space_race_participants/${raceId}/${participantId}` : null,
    { enabled: Boolean(raceId && participantId) }
  );

  const normalizedTeamId = useMemo(
    () =>
      normalizeSharedTeamId(
        liveParticipantData?.teamId ?? participant?.teamId ?? paramTeamIdRaw
      ),
    [liveParticipantData?.teamId, participant?.teamId, paramTeamIdRaw]
  );
  const teamIdForApi =
    normalizedTeamId != null && Number.isFinite(Number(normalizedTeamId))
      ? Number(normalizedTeamId)
      : normalizedTeamId;
  const teamId = teamIdForApi ?? 0;

  const teamSelectionPath =
    raceId && normalizedTeamId != null
      ? `space_race_team_selection/${raceId}/team_${normalizedTeamId}`
      : null;
  const currentQuestionSelectionPath =
    teamSelectionPath && questionId ? `${teamSelectionPath}/question_${questionId}` : null;

  const hookedTeamSelections = useLiveTeamSelectionMap(
    raceId,
    normalizedTeamId,
    liveQuestionKeys
  );
  const { value: liveTeamRaw } = useRtdbValue(teamSelectionPath, {
    enabled: Boolean(teamSelectionPath),
  });
  const { value: submissionState } = useRtdbValue(currentQuestionSelectionPath, {
    enabled: Boolean(currentQuestionSelectionPath),
  });
  const liveTeamSelections = useMemo(() => {
    const fromTree = nodesFromSnapshot(liveTeamRaw);
    return mergeTeamSelectionMaps(hookedTeamSelections, fromTree);
  }, [hookedTeamSelections, liveTeamRaw]);

  const { value: teamScoreNode } = useRtdbValue(
    raceId && normalizedTeamId != null
      ? `space_race_team_scores/${raceId}/team_${normalizedTeamId}`
      : null,
    { enabled: Boolean(raceId && normalizedTeamId != null) }
  );
  const { value: teamTimer } = useRtdbValue(
    raceId && normalizedTeamId != null
      ? `space_race_team_timers/${raceId}/team_${normalizedTeamId}`
      : null,
    { enabled: Boolean(raceId && normalizedTeamId != null) }
  );
  const { value: serverTimeOffsetRaw } = useRtdbValue('.info/serverTimeOffset', {
    enabled: Boolean(raceId),
  });
  const quizDurationSeconds = Number(race?.settings?.countdown);
  const quizDurationLimited = isQuizDurationLimited(quizDurationSeconds);
  const quizTimerPulse = useRef(new Animated.Value(1)).current;
  const participantAnswerRow = participantAnswerForQuestion(
    liveParticipantData?.answers,
    question,
    index,
    questionId
  );
  const lockNode = useMemo(() => {
    const liveNodes = [...findLiveQuestionNodes(liveTeamSelections, question, index)];
    if (submissionState && typeof submissionState === 'object') {
      liveNodes.push(submissionState);
    }
    liveQuestionKeys.forEach((id) => {
      if (localLock[id]) liveNodes.push(localLock[id]);
    });
    if (questionId && localLock[questionId]) liveNodes.push(localLock[questionId]);
    if (participantAnswerRow) {
      liveNodes.push({
        selectedOption: participantAnswerRow.answer ?? participantAnswerRow.selectedOption,
        answer: participantAnswerRow.answer,
        submitted: true,
        submittedBy: participantAnswerRow.submittedBy,
        submittedByName: participantAnswerRow.submittedByName,
      });
    }
    return pickQuestionLockNode(liveNodes);
  }, [
    liveTeamSelections,
    question,
    index,
    submissionState,
    localLock,
    questionId,
    liveQuestionKeys,
    participantAnswerRow,
  ]);
  const participantAnswerLocksCurrent = Boolean(participantAnswerRow);
  const submitted =
    isSubmittedLockNode(lockNode) ||
    isSubmittedLockNode(submissionState) ||
    (questionId ? submittedQuestionKeys.has(questionId) : false) ||
    liveQuestionKeys.some((id) => submittedQuestionKeys.has(id)) ||
    participantAnswerLocksCurrent;
  submittedRef.current = submitted;
  const liveAnswer = readLockAnswer(lockNode);
  const lockedAnswerValue = submitted
    ? readLockAnswer(lockNode).trim() ||
      readLockAnswer(submissionState).trim() ||
      String(participantAnswerRow?.answer ?? participantAnswerRow?.selectedOption ?? '').trim() ||
      ''
    : '';
  const displaySelectedOption = submitted
    ? lockedAnswerValue || liveAnswer
    : liveAnswer || (questionId ? answersById[questionId] : '') || '';
  const memberName = teammateDisplayName(participant, profile);
  const selectedByName = submitted
    ? lockNode?.submittedByName ||
      lockNode?.selectedByName ||
      submissionState?.submittedByName ||
      participantAnswerRow?.submittedByName ||
      'A teammate'
    : lockNode?.selectedByName || lockNode?.submittedByName || 'A teammate';

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
    if (!liveParticipantData || !participantId) return;
    setParticipant((prev: any) => {
      const base = prev || { id: participantId };
      const nextTeam = liveParticipantData.teamId ?? base.teamId;
      const nextAnswers = liveParticipantData.answers ?? base.answers;
      const nextName = liveParticipantData.name ?? base.name;
      if (
        String(base.teamId ?? '') === String(nextTeam ?? '') &&
        base.answers === nextAnswers &&
        String(base.name ?? '') === String(nextName ?? '')
      ) {
        return prev || base;
      }
      return { ...base, ...liveParticipantData, id: base.id || participantId };
    });
  }, [liveParticipantData, participantId]);

  useEffect(() => {
    if (!liveTeamSelections || typeof liveTeamSelections !== 'object') return;
    setAnswersById((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(liveTeamSelections).forEach(([nodeKey, nodeVal]: [string, any]) => {
        if (!nodeKey.startsWith('question_') || !nodeVal) return;
        const id = nodeKey.slice('question_'.length);
        const value = nodeVal.selectedOption ?? nodeVal.answer;
        if (value == null || String(value).trim() === '') return;
        if (String(next[id] ?? '') !== String(value)) {
          next[id] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [liveTeamSelections]);

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
    if (finished) return undefined;
    const endIso = teamTimer?.endTime;
    const started = Boolean(teamTimer?.quizStartedAt);
    if (!quizDurationLimited || !started || !endIso) {
      setTimeLeft(null);
      return undefined;
    }
    const tick = () => {
      const now = Date.now() + (Number(serverTimeOffsetRaw) || 0);
      const remaining = remainingSecondsUntil(endIso, now);
      if (remaining == null) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft(remaining);
      if (remaining <= 0) setQuizTimeExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [
    teamTimer?.endTime,
    teamTimer?.quizStartedAt,
    quizDurationLimited,
    serverTimeOffsetRaw,
    finished,
  ]);

  useEffect(() => {
    if (timeLeft == null || timeLeft > 10) {
      quizTimerPulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(quizTimerPulse, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(quizTimerPulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      quizTimerPulse.setValue(1);
    };
  }, [timeLeft, quizTimerPulse]);

  useEffect(() => {
    const currentLive = readLockAnswer(lockNode);
    if (submitted) {
      if (currentLive) setAnswer(currentLive);
      return;
    }
    if (currentLive) {
      setAnswer(currentLive);
      return;
    }
    if (questionId && answersById[questionId] != null) {
      setAnswer(answersById[questionId]);
      return;
    }
    setAnswer('');
  }, [lockNode, submitted, index, questionId]);

  useEffect(() => {
    if (!submitted || !lockedAnswerValue) return;
    const ids = new Set([questionId, ...liveQuestionKeys]);
    setAnswersById((prev) => {
      let changed = false;
      const next = { ...prev };
      ids.forEach((id) => {
        if (!id) return;
        if (String(next[id] ?? '') !== String(lockedAnswerValue)) {
          next[id] = lockedAnswerValue;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [submitted, lockedAnswerValue, questionId, liveQuestionKeys]);

  useEffect(() => {
    if (!__DEV__) return;
    if (submitted && !String(displaySelectedOption || '').trim()) {
      console.warn('[SpaceRace] locked but no option is marked', {
        questionId,
        index,
        lockNode,
      });
    }
  }, [submitted, displaySelectedOption, questionId, index, lockNode]);

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
  const progressFromShared = useMemo(() => {
    if (!questions.length) return 0;
    const count = questions.filter((q: any, qIndex: number) =>
      questionHasTeamAnswer(q, qIndex, liveTeamSelections, localLock, answersById)
    ).length;
    return (count / questions.length) * 100;
  }, [questions, liveTeamSelections, localLock, answersById]);
  const quizClockExpired =
    quizDurationLimited &&
    Boolean(teamTimer?.quizStartedAt && teamTimer?.endTime) &&
    (remainingSecondsUntil(
      teamTimer?.endTime,
      Date.now() + (Number(serverTimeOffsetRaw) || 0)
    ) ?? 1) <= 0;
  const timerBlocksSubmit = quizTimeExpired || quizClockExpired || raceEnded;
  const quizOptions = useMemo(
    () => readSpaceRaceQuizOptions(quiz, race?.settings),
    [quiz, race?.settings]
  );
  const showFinalScore = quizOptions.showFinalScore;
  const showQuestionFeedback = quizOptions.showQuestionFeedback;
  const prevSubmittedRef = useRef<boolean | null>(null);

  useEffect(() => {
    prevSubmittedRef.current = null;
  }, [index, questionId]);

  useEffect(() => {
    const wasSubmitted = prevSubmittedRef.current;
    prevSubmittedRef.current = submitted;
    if (wasSubmitted === null) return;
    if (!showQuestionFeedback || !submitted || wasSubmitted) return;
    const by = String(lockNode?.submittedBy || lockNode?.selectedBy || '');
    if (by && participantId && by === participantId) return;
    const isCorrect = lockNode?.isCorrect === true;
    showToast({
      type: 'info',
      title: isCorrect ? '✅ Correct answer!' : '❌ Incorrect answer',
      icon: 'checkmark-circle',
    });
  }, [
    submitted,
    showQuestionFeedback,
    lockNode?.isCorrect,
    lockNode?.submittedBy,
    lockNode?.selectedBy,
    participantId,
  ]);

  const optionList = () => {
    if (!question) return [] as string[];
    if (Array.isArray(question.options) && question.options.length > 0) {
      return question.options.map(optionText).filter(Boolean);
    }
    const effective = getEffectiveQuestionType(quiz?.type, question);
    if (effective === 'True / False' || String(question.type || '').toLowerCase().includes('true')) {
      return ['True', 'False'];
    }
    return [];
  };

  const applyLocalLock = (id: string, node: any) => {
    if (!id) return;
    const ids = new Set<string>([id, ...liveQuestionKeys]);
    setLocalLock((prev) => {
      const next = { ...prev };
      ids.forEach((key) => {
        next[key] = { ...(prev[key] || {}), ...node };
      });
      return next;
    });
  };

  const markQuestionSubmitted = (id: string, node: any) => {
    if (!id) return;
    const ids = new Set<string>([id, ...liveQuestionKeys]);
    setSubmittedQuestionKeys((prev) => {
      let changed = false;
      const next = new Set(prev);
      ids.forEach((key) => {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    applyLocalLock(id, { ...node, submitted: true });
  };

  const unmarkOptimisticSubmit = (id: string) => {
    if (!id) return;
    const ids = new Set<string>([id, ...liveQuestionKeys]);
    setSubmittedQuestionKeys((prev) => {
      if (![...ids].some((key) => prev.has(key))) return prev;
      const next = new Set(prev);
      ids.forEach((key) => next.delete(key));
      return next;
    });
    setLocalLock((prev) => {
      const next = { ...prev };
      ids.forEach((key) => {
        if (next[key]) next[key] = { ...next[key], submitted: false };
      });
      return next;
    });
  };

  const onSelect = async (value: any) => {
    if (timerBlocksSubmit || submitted) return;
    if (isSubmittedLockNode(lockNode)) return;
    setAnswer(value);
    if (questionId) {
      setAnswersById((prev) => ({ ...prev, [questionId]: value }));
    }
    if (!participantId || !questionId || normalizedTeamId == null) return;
    const optimisticSelection = {
      selectedOption: value,
      selectedBy: participantId,
      selectedByName: memberName,
      submitted: false,
    };
    setLocalLock((prev) => {
      if (isSubmittedLockNode(prev[questionId])) return prev;
      return { ...prev, [questionId]: { ...optimisticSelection } };
    });
    try {
      await setTeamSelection(raceId, {
        teamId: normalizedTeamId,
        questionId,
        selectedOption: value,
        participantId,
        participantName: memberName,
        senderName: memberName,
      });
    } catch (err) {
      const errMsg = String((err as any)?.data?.error || (err as Error)?.message || '');
      if (errMsg.toLowerCase().includes('already submitted')) {
        markQuestionSubmitted(questionId, { submitted: true, selectedOption: value });
      }
    }
  };

  const goToLobby = () => {
    router.replace(
      appendActivityEntrySource(`/audience/space-race?raceId=${raceId}`, source) as Href
    );
  };

  const finishQuiz = async () => {
    setFinished(true);
    if (!participantId || normalizedTeamId == null) return;
    try {
      const scoreRes: any = await getFinalScore(raceId, {
        teamId: teamIdForApi as number,
        participantId,
      });
      const payload = (scoreRes?.data ?? scoreRes) as SpaceRaceFinalScoreApi;
      setFinalApi(payload);
      const score =
        payload?.score ?? scoreRes?.score ?? teamScore ?? participant?.score ?? 0;
      setFinalScore(Number(score) || 0);
      const updated = { ...participant, score: Number(score) || 0 };
      setParticipant(updated);
      await saveSpaceRaceParticipant(updated);
    } catch {
      setFinalApi(null);
      setFinalScore(teamScore);
    }
  };

  const onSubmit = async () => {
    if (!participantId || !question || busy || normalizedTeamId == null) return;
    if (timerBlocksSubmit) {
      setQuizTimeExpired(true);
      return;
    }
    if (submitted) return;
    const answerToSend =
      (displaySelectedOption != null && String(displaySelectedOption).trim() !== ''
        ? displaySelectedOption
        : answer) ?? '';
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
      submittedBy: participantId,
      submittedByName: memberName,
      selectedByName: memberName,
    };
    markQuestionSubmitted(questionId, submittedSelection);

    setBusy(true);
    try {
      const response = await submitRaceAnswer(raceId, {
        teamId: normalizedTeamId,
        questionId,
        answer: answerToSend,
        participantId,
        participantName: memberName,
        questionIndex: index,
      });
      if ((response as any)?.expired) {
        setQuizTimeExpired(true);
        return;
      }
      if (!response.success && response.error) {
        throw new Error(response.error);
      }
      markQuestionSubmitted(questionId, submittedSelection);
      if (__DEV__) {
        setTimeout(() => {
          if (!submittedRef.current) {
            console.warn(
              '[SpaceRace] submit write succeeded but the current screen has not locked within 1s',
              { questionId, index }
            );
          }
        }, 1000);
      }
      if (showQuestionFeedback) {
        const payload = (response as any)?.data ?? response;
        const isCorrect = payload?.isCorrect === true;
        showToast({
          type: 'info',
          title: isCorrect ? '✅ Correct answer!' : '❌ Incorrect answer',
          icon: 'checkmark-circle',
        });
      } else {
        showToast({
          type: 'success',
          title: 'Answer submitted for your team.',
          icon: 'checkmark-circle',
        });
      }
      try {
        await setTeamSelection(raceId, {
          teamId: normalizedTeamId,
          questionId,
          selectedOption: answerToSend,
          participantId,
          participantName: memberName,
          senderName: memberName,
          submitted: true,
          submittedByName: memberName,
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
        try {
          const existing = await getTeamSelection(raceId, normalizedTeamId, questionId);
          const payload = (existing as any)?.data;
          if (payload && typeof payload === 'object') {
            markQuestionSubmitted(questionId, { ...payload, submitted: true });
          } else {
            markQuestionSubmitted(questionId, submittedSelection);
          }
        } catch {
          markQuestionSubmitted(questionId, submittedSelection);
        }
        return;
      }
      unmarkOptimisticSubmit(questionId);
      showToast({
        type: 'info',
        title: "Couldn't submit. Try again.",
        icon: 'alert-circle',
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
    const resultStats = spaceRaceResultStats({
      totalQuestions: questions.length,
      teamSelections: liveTeamSelections,
      teamScoreOutOf100: finalScore ?? teamScore,
      api: finalApi,
    });
    const displayScore = resultStats.correctCount;
    const displayPercentage = resultStats.percentage;
    const totalQuestionsCount = resultStats.totalQuestions;

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
              <Text style={styles.statNum}>{resultStats.incorrectCount}</Text>
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
  const currentCountsTowardProgress =
    displaySelectedOption != null && String(displaySelectedOption).trim() !== ''
      ? !questionHasTeamAnswer(question, index, liveTeamSelections, localLock, answersById)
      : false;
  const progressPct = questions.length
    ? progressFromShared + (currentCountsTowardProgress ? 100 / questions.length : 0)
    : 0;
  if (__DEV__ && submitted && questions.length) {
    const currentCounted =
      questionHasTeamAnswer(question, index, liveTeamSelections, localLock, answersById) ||
      currentCountsTowardProgress;
    if (!currentCounted) {
      console.warn('[SpaceRace] shown percentage differs from shared-data progress', {
        questionId,
        progressPct,
        progressFromShared,
      });
    }
  }
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
        <View style={styles.questionCard}>
          <View style={styles.progressRow}>
            <Text
              style={[styles.progressMeta, compactProgressRow && styles.progressMetaCompact]}
              numberOfLines={1}>
              Question {index + 1} of {questions.length}
            </Text>
            <View style={styles.timerSlot} pointerEvents="none">
              {timeLeft != null ? (
                <QuizTimerPill seconds={timeLeft} pulse={quizTimerPulse} compact={compactProgressRow} />
              ) : null}
            </View>
            <Text
              style={[styles.progressPct, compactProgressRow && styles.progressPctCompact]}
              numberOfLines={1}>
              {Math.round(progressPct)}% Complete
            </Text>
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
                {` (${selectedByName || 'A teammate'})`}
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
            options.map((option: string, optionIndex: number) => {
              const rawOption = Array.isArray(question.options)
                ? question.options[optionIndex]
                : option;
              const selected = optionMatchesSelection(rawOption ?? option, displaySelectedOption);
              return (
                <TouchableOpacity
                  key={`${optionIndex}-${String(option)}-${selected ? 'selected' : 'idle'}`}
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
              {busy ? (
                <View style={styles.submitBusy}>
                  <ActivityIndicator color={COLORS.white} size="small" />
                  <Text style={styles.primaryLabel}>Submitting...</Text>
                </View>
              ) : (
                <Text style={styles.primaryLabel}>🚀 Submit Answer for Team</Text>
              )}
            </TouchableOpacity>
          ) : null}

          <QuizQuestionNavButtons
            previousDisabled={index === 0}
            onPrevious={() => setIndex((prev) => Math.max(0, prev - 1))}
            hidePrimary={!submitted}
            primaryLabel={index === questions.length - 1 ? 'Finish' : 'Next'}
            onPrimary={
              index === questions.length - 1 ? finishQuiz : () => setIndex((prev) => prev + 1)
            }
            showTrailingArrow={index !== questions.length - 1}
          />
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
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: COLORS.blush,
    justifyContent: 'center',
    flexShrink: 0,
  },
  timerPillWarn: { backgroundColor: '#FEF3C7' },
  timerPillCrit: { backgroundColor: '#FEE2E2' },
  timerPillText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    fontVariant: ['tabular-nums'],
  },
  timerPillTextCompact: { fontSize: 12 },
  timerPillTextWarn: { color: '#B45309' },
  timerPillTextCrit: { color: '#DC2626' },
  timerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
  },
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
    flexWrap: 'nowrap',
    width: '100%',
  },
  progressMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: COLORS.inkSecondary,
  },
  progressMetaCompact: { fontSize: 12 },
  progressPct: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.primary,
    textAlign: 'right',
  },
  progressPctCompact: { fontSize: 12 },
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
  submitBusy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
});
