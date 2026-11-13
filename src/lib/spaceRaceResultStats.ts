/**
 * Space Race results display — same fields and formulas as Web
 * AudienceQuizAttempt `spaceRaceSharedScore` / server calculateTeamScoreFromAnswers.
 *
 * Score is (correct / total) * 100, rounded. Unanswered questions count as incorrect.
 * RTDB `space_race_team_scores/{race}/team_{id}.score` is points out of 100,
 * not a correct-answer count.
 */

export type SpaceRaceResultStats = {
  correctCount: number;
  totalQuestions: number;
  incorrectCount: number;
  percentage: number;
  /** Team score out of 100 (Web `score`). */
  score: number;
};

export type SpaceRaceFinalScoreApi = {
  score?: number;
  correctAnswers?: number;
  correctCount?: number;
  totalQuestions?: number;
  percentage?: number;
  data?: SpaceRaceFinalScoreApi;
};

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function answersFromTeamSelection(selectionVal: Record<string, any> | null | undefined) {
  const answers: { questionId: string; isCorrect?: boolean }[] = [];
  if (!selectionVal || typeof selectionVal !== 'object') return answers;
  const seen = new Set<string>();
  Object.entries(selectionVal).forEach(([nodeKey, nodeVal]) => {
    if (!nodeVal || !String(nodeKey).startsWith('question_')) return;
    if (nodeVal.submitted !== true && nodeVal.submitted !== 'true') return;
    const questionId = String(nodeKey).slice('question_'.length);
    if (!questionId || seen.has(questionId)) return;
    seen.add(questionId);
    answers.push({ questionId, isCorrect: nodeVal.isCorrect === true });
  });
  return answers;
}

/** Same as Web/server calculateTeamScoreFromAnswers: round((correct / N) * 100). */
export function spaceRaceTeamPercentFromSelections(
  selectionVal: Record<string, any> | null | undefined,
  totalQuestions: number
) {
  const n = Number(totalQuestions) || 0;
  if (n <= 0) return { score: 0, correctCount: 0, totalQuestions: 0 };
  const answers = answersFromTeamSelection(selectionVal);
  const correctCount = answers.filter((a) => a.isCorrect === true).length;
  return {
    score: Math.round((correctCount / n) * 100),
    correctCount,
    totalQuestions: n,
  };
}

export function spaceRaceResultStats(input: {
  totalQuestions: number;
  teamSelections?: Record<string, any> | null;
  participantAnswers?: unknown;
  teamScoreOutOf100?: number | null;
  api?: SpaceRaceFinalScoreApi | null;
}): SpaceRaceResultStats {
  const apiRoot = input.api?.data && typeof input.api.data === 'object' ? input.api.data : input.api;
  const total = Math.max(
    0,
    Math.floor(asFiniteNumber(apiRoot?.totalQuestions) ?? asFiniteNumber(input.totalQuestions) ?? 0)
  );

  const fromSelections = answersFromTeamSelection(input.teamSelections);
  const teamMapPresent = input.teamSelections != null && typeof input.teamSelections === 'object';
  const participantAnswers = Array.isArray(input.participantAnswers) ? input.participantAnswers : [];
  const apiCorrect = asFiniteNumber(apiRoot?.correctAnswers ?? apiRoot?.correctCount);

  let correctCount = 0;
  if (fromSelections.length > 0) {
    correctCount = fromSelections.filter((a) => a?.isCorrect === true).length;
    if (apiCorrect != null && apiCorrect > correctCount && apiCorrect <= total) {
      correctCount = apiCorrect;
    }
  } else if (apiCorrect != null) {
    correctCount = apiCorrect;
  } else if (!teamMapPresent) {
    correctCount = participantAnswers.filter((a: any) => a?.isCorrect === true).length;
  }

  const computedScore = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const liveTeamScore = asFiniteNumber(input.teamScoreOutOf100) ?? 0;
  const apiScore = asFiniteNumber(apiRoot?.score);
  const score =
    fromSelections.length > 0
      ? computedScore
      : apiScore ?? (liveTeamScore || computedScore);

  if (correctCount === 0 && score > 0 && total > 0) {
    correctCount = Math.round((score / 100) * total);
  }

  correctCount = clampInt(correctCount, 0, total);
  const percentage = total > 0 ? clampInt(Math.round((correctCount / total) * 100), 0, 100) : 0;
  const stats: SpaceRaceResultStats = {
    correctCount,
    totalQuestions: total,
    incorrectCount: Math.max(0, total - correctCount),
    percentage,
    score: clampInt(asFiniteNumber(score) ?? percentage, 0, 100),
  };

  if (__DEV__) {
    const sumCorrect = fromSelections.filter((a) => a.isCorrect === true).length;
    if (fromSelections.length > 0 && stats.correctCount !== sumCorrect && apiCorrect == null) {
      console.warn('[SpaceRace] team score differs from sum of shared submitted answers', {
        stats,
        fromSelectionsCount: fromSelections.length,
        sumCorrect,
      });
    }
  }

  return stats;
}

export function getPerformanceComment(percentage: number) {
  if (percentage >= 90) return "Outstanding! You're a star performer! 🌟";
  if (percentage >= 80) return "Excellent work! You really know your stuff! 🎯";
  if (percentage >= 65) return 'Great job! Keep up the good work! 👏';
  if (percentage >= 50) return 'Good effort! Room for improvement! 💪';
  if (percentage >= 35) return 'Nice try! Keep practicing! 📚';
  return "Keep learning! You'll do better next time! 🌱";
}
