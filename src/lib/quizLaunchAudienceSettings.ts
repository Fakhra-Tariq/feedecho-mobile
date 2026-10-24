/** Port of Web quizLaunchAudienceSettings for regular (non space-race) quizzes. */

const seededRandomGenerator = (seed: string | number) => {
  let state: number;
  if (typeof seed === 'string') {
    state = seed.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  } else if (typeof seed === 'number') {
    state = seed;
  } else {
    state = String(seed)
      .split('')
      .reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
  }
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
};

const shuffleArray = <T,>(array: T[], seed: string | number): T[] => {
  const seededRandom = seededRandomGenerator(seed);
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const normalizeToArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') {
    return Object.keys(value as object)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (value as any)[key])
      .filter(Boolean);
  }
  return [];
};

const cloneQuestionOptions = (options: unknown) => {
  if (!Array.isArray(options)) return options;
  return options.map((option) =>
    typeof option === 'object' && option !== null ? { ...option } : option
  );
};

const getQuestionShuffleKey = (question: any, index: number) =>
  question?.id ?? question?.questionId ?? `idx-${index}`;

export function applyQuizShuffleSettings(quizData: any, participantId?: string | null) {
  if (!quizData) return quizData;
  const settings = quizData?.launchSettings || {};
  const seedBase = String(participantId || quizData?.id || 'student');
  let questions = normalizeToArray(quizData?.questions).map((question, index) => ({
    ...question,
    options: cloneQuestionOptions(question?.options),
    _shuffleKey: getQuestionShuffleKey(question, index),
  }));

  if (settings.shuffleQuestions && questions.length > 1) {
    questions = shuffleArray(questions, `quiz-${quizData.id}-p-${seedBase}`);
  }

  if (settings.shuffleAnswers) {
    questions = questions.map((question) => {
      const options = question?.options;
      if (Array.isArray(options) && options.length > 1) {
        const questionKey = question._shuffleKey || getQuestionShuffleKey(question, 0);
        const optionsCopy = cloneQuestionOptions(options) as any[];
        const { _shuffleKey, ...questionWithoutKey } = question;
        return {
          ...questionWithoutKey,
          options: shuffleArray(
            optionsCopy,
            `quiz-${quizData.id}-p-${seedBase}-answers-${questionKey}`
          ),
        };
      }
      const { _shuffleKey, ...questionWithoutKey } = question;
      return questionWithoutKey;
    });
  } else {
    questions = questions.map(({ _shuffleKey, ...question }) => question);
  }

  return {
    ...quizData,
    questions,
  };
}

export function isQuizJoinWindowExpired(launchSettings: any) {
  if (!launchSettings?.endTime) return false;
  const endMs = new Date(launchSettings.endTime).getTime();
  return !Number.isNaN(endMs) && Date.now() > endMs;
}

export function getStudentAttemptSecondsRemaining(
  launchSettings: any,
  joinedAtIso?: string | null
) {
  if (!launchSettings?.timePerStudentMinutes) return null;

  const joinTime = joinedAtIso ? new Date(joinedAtIso) : new Date();
  const now = new Date();
  const timeSinceJoin = Math.floor((now.getTime() - joinTime.getTime()) / 1000);
  const totalStudentTime = Number(launchSettings.timePerStudentMinutes) * 60;
  let remaining = Math.max(0, totalStudentTime - timeSinceJoin);

  if (launchSettings?.endTime) {
    const quizEndTime = new Date(launchSettings.endTime);
    const quizTimeRemaining = Math.max(
      0,
      Math.floor((quizEndTime.getTime() - now.getTime()) / 1000)
    );
    remaining = Math.min(remaining, quizTimeRemaining);
  }

  return remaining;
}

export function resolveRegularQuizTimeLeft(quizData: any, joinedAtIso?: string | null) {
  if (quizData?.launchSettings?.timePerStudentMinutes) {
    return getStudentAttemptSecondsRemaining(quizData.launchSettings, joinedAtIso);
  }
  if (quizData?.launchSettings?.timeLimit) {
    return Number(quizData.launchSettings.timeLimit) * 60;
  }
  if (quizData?.launchSettings?.quizAvailabilityMinutes && quizData?.launchSettings?.endTime) {
    const endTime = new Date(quizData.launchSettings.endTime);
    return Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 1000));
  }
  return null;
}
