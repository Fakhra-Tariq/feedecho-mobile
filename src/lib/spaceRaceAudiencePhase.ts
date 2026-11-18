import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { isJoinWindowExpired } from '@/lib/spaceRaceJoinWindow';

/** True only on the question/Time's Up screen, not leftover start/attempt flags. */
export function isSpaceRaceQuizPath(pathname: string | null | undefined) {
  return /(?:^|\/)space-race-quiz(?:\/|\?|$)/.test(String(pathname || ''));
}

/** Host End Race writes status "completed" (also accept ended/finished). Same as Web. */
export function isSpaceRaceEndedByTeacher(race: { status?: unknown; isActive?: unknown } | null | undefined) {
  const status = String(race?.status || '').toLowerCase();
  if (status === 'ended' || status === 'completed' || status === 'finished') return true;
  if (race?.isActive === false) return true;
  return false;
}

export function getQuizDeadlineMs(endIso: unknown) {
  if (!endIso) return null;
  const t = new Date(String(endIso)).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * completed → completed
 * teacher ended → inside ? race_ended : closed
 * inside and (join or quiz deadline passed) → times_up
 * outside and join/quiz deadline passed → closed
 * else open
 */
export function resolveSpaceRaceAudiencePhase({
  completed = false,
  insideQuiz = false,
  race = null,
  nowMs = Date.now(),
  quizEndMs = null,
  joinExpired: joinExpiredOverride,
}: {
  completed?: boolean;
  insideQuiz?: boolean;
  race?: { status?: unknown; isActive?: unknown; startedAt?: unknown; settings?: { joinDuration?: unknown } } | null;
  nowMs?: number;
  quizEndMs?: number | null;
  joinExpired?: boolean;
} = {}) {
  if (completed) return 'completed';
  if (isSpaceRaceEndedByTeacher(race)) {
    return insideQuiz ? 'race_ended' : 'closed';
  }
  const joinExpired =
    joinExpiredOverride != null
      ? Boolean(joinExpiredOverride)
      : isJoinWindowExpired(race, nowMs);
  const quizExpired =
    quizEndMs != null && Number.isFinite(Number(quizEndMs)) && nowMs >= Number(quizEndMs);
  if (insideQuiz && (joinExpired || quizExpired)) return 'times_up';
  if (!insideQuiz && (joinExpired || quizExpired)) return 'closed';
  return 'open';
}

/** Wall clock + optional RTDB offset; ticks every second and on AppState active. */
export function useAlignedNowMs(serverTimeOffset = 0, enabled = true) {
  const [wallMs, setWallMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => setWallMs(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      appSub.remove();
    };
  }, [enabled]);

  return wallMs + (Number(serverTimeOffset) || 0);
}

/** Web AudienceQuizAttempt Quiz Error copy when the host ends a race mid-quiz. */
export const SPACE_RACE_ENDED_BY_TEACHER_MESSAGE = 'This Space Race has already ended.';
