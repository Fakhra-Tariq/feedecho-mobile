/**
 * Same availability-window rule as Web `utils/quizExpiry.js`:
 * launched + launchSettings.endTime vs Date.now(). No endTime = never expires.
 */

export type QuizExpiryInput = {
  launched?: boolean | string | number | null;
  status?: string;
  launchSettings?: { endTime?: string | null } | null;
};

function isLaunchedFlag(quiz: QuizExpiryInput) {
  const value = quiz.launched as unknown;
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function getQuizTimeRemaining(quiz: QuizExpiryInput, now = Date.now()): number | null {
  if (!isLaunchedFlag(quiz) || !quiz.launchSettings?.endTime) {
    return null;
  }

  const endTime = new Date(quiz.launchSettings.endTime).getTime();
  if (Number.isNaN(endTime)) return null;

  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const remaining = endTime - nowMs;
  if (remaining <= 0) return 0;
  return Math.floor(remaining / 1000);
}

export function isQuizExpired(quiz: QuizExpiryInput | null | undefined, now = Date.now()) {
  return getQuizTimeRemaining(quiz || {}, now) === 0;
}

export function isQuizCurrentlyActive(quiz: QuizExpiryInput | null | undefined, now = Date.now()) {
  if (!quiz) return false;
  const status = String(quiz.status || '').toLowerCase();
  if (
    status === 'ready' ||
    status === 'ended' ||
    status === 'finished' ||
    status === 'completed' ||
    status === 'archived'
  ) {
    return false;
  }
  const launched = isLaunchedFlag(quiz) || status === 'launched' || status === 'active';
  if (!launched) return false;
  if (isQuizExpired(quiz, now)) return false;
  return true;
}
