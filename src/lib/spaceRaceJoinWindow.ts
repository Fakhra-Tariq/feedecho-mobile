/** Join window = race.startedAt + settings.joinDuration (minutes). Same fields as host Join Time. */

export function getJoinDurationMinutes(settings: { joinDuration?: unknown } | null | undefined) {
  const minutes = Number(settings?.joinDuration);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes;
}

export function getJoinWindowEndMs(race: { startedAt?: unknown; settings?: { joinDuration?: unknown } } | null | undefined) {
  const minutes = getJoinDurationMinutes(race?.settings);
  if (minutes == null) return null;
  const start = race?.startedAt ? new Date(String(race.startedAt)).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  return start + minutes * 60 * 1000;
}

/** True when join duration has ended. Unlimited / missing duration → false. */
export function isJoinWindowExpired(
  race: { startedAt?: unknown; settings?: { joinDuration?: unknown } } | null | undefined,
  nowMs: number = Date.now()
) {
  const endMs = getJoinWindowEndMs(race);
  if (endMs == null) return false;
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return false;
  return now >= endMs;
}

export class JoinWindowExpiredError extends Error {
  status = 403;
  data = {
    success: false,
    expired: true,
    joinWindowExpired: true,
    error: "Time's up — this quiz is closed.",
  };

  constructor() {
    super("Time's up — this quiz is closed.");
    this.name = 'JoinWindowExpiredError';
  }
}

export function isJoinWindowExpiredError(err: unknown) {
  if (err instanceof JoinWindowExpiredError) return true;
  const data = (err as { data?: { joinWindowExpired?: boolean } } | null)?.data;
  return Boolean(data?.joinWindowExpired);
}
