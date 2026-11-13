/**
 * Audience Space Race quiz load — same as Web AudienceQuizAttempt.loadSpaceRaceQuiz:
 * GET /space-races/:id (public) attaches quiz via quizId. RTDB spaceRaces/{id} does not
 * embed questions. Shuffle seed is `${raceId}_team_${teamId}` like Web bootstrapSpaceRace.
 */

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

export function normalizeQuestionList(questions: unknown): any[] {
  if (Array.isArray(questions)) return questions.filter(Boolean);
  if (questions && typeof questions === 'object') {
    return Object.keys(questions as object)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (questions as any)[key])
      .filter(Boolean);
  }
  return [];
}

export function teamQuizCacheKey(teamId?: number | string | null) {
  return `spaceRaceQuiz_team_${teamId ?? 'default'}`;
}

/** Same flags as Web GET /space-races/:id `launchSettings.spaceRaceSettings`. */
export type SpaceRaceQuizOptions = {
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showQuestionFeedback: boolean;
  showFinalScore: boolean;
};

export const SPACE_RACE_QUIZ_OPTION_DEFAULTS: SpaceRaceQuizOptions = {
  shuffleQuestions: false,
  shuffleAnswers: false,
  showQuestionFeedback: false,
  showFinalScore: true,
};

function pickBool(sources: unknown[], key: keyof SpaceRaceQuizOptions, fallback: boolean) {
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const src = sources[i] as Record<string, unknown> | null | undefined;
    if (src && typeof src === 'object' && src[key] !== undefined && src[key] !== null) {
      return Boolean(src[key]);
    }
  }
  return fallback;
}

/**
 * Race.settings wins, then quiz.launchSettings.spaceRaceSettings, then quiz.spaceRaceSettings.
 * Defaults match Web server attach: shuffle/feedback false, showFinalScore true.
 */
export function readSpaceRaceQuizOptions(
  quizData?: any,
  raceSettings?: any
): SpaceRaceQuizOptions {
  const sources = [
    quizData?.spaceRaceSettings,
    quizData?.launchSettings?.spaceRaceSettings,
    raceSettings,
  ];
  return {
    shuffleQuestions: pickBool(sources, 'shuffleQuestions', SPACE_RACE_QUIZ_OPTION_DEFAULTS.shuffleQuestions),
    shuffleAnswers: pickBool(sources, 'shuffleAnswers', SPACE_RACE_QUIZ_OPTION_DEFAULTS.shuffleAnswers),
    showQuestionFeedback: pickBool(
      sources,
      'showQuestionFeedback',
      SPACE_RACE_QUIZ_OPTION_DEFAULTS.showQuestionFeedback
    ),
    showFinalScore: pickBool(sources, 'showFinalScore', SPACE_RACE_QUIZ_OPTION_DEFAULTS.showFinalScore),
  };
}

export function bootstrapSpaceRaceQuiz(input: {
  quizData: any;
  raceId: string;
  teamId?: number | string | null;
  participantId?: string | null;
  raceSettings?: any;
  skipShuffle?: boolean;
}) {
  const { quizData, raceId, teamId, participantId, raceSettings, skipShuffle } = input;
  const settings = readSpaceRaceQuizOptions(quizData, raceSettings);

  let questions = normalizeQuestionList(quizData?.questions);

  if (!skipShuffle) {
    const seedTeam = teamId ?? participantId ?? 'default';
    if (settings.shuffleQuestions && questions.length > 1) {
      questions = shuffleArray(questions, `${raceId}_team_${seedTeam}`);
    }
    if (settings.shuffleAnswers) {
      questions = questions.map((question, qIndex) => {
        if (Array.isArray(question?.options) && question.options.length > 1) {
          return {
            ...question,
            options: shuffleArray(
              [...question.options],
              `${raceId}_team_${seedTeam}_q${qIndex}`
            ),
          };
        }
        return question;
      });
    }
  }

  return {
    ...quizData,
    launched: true,
    questions,
    launchSettings: {
      ...(quizData?.launchSettings || {}),
      spaceRaceSettings: settings,
    },
  };
}
