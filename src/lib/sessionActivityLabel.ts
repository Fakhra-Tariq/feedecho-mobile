import { isQuizCurrentlyActive, type QuizExpiryInput } from '@/lib/quizExpiry';

/**
 * Same as Web `normalizeSessionCurrentActivity`.
 */
export function normalizeSessionCurrentActivity(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const row = value as { status?: string; type?: string; activityId?: string; id?: string };
    if (row.status && String(row.status).toLowerCase() === 'finished') return null;
    const t = String(row.type || '')
      .toLowerCase()
      .replace(/_/g, '');
    if (t === 'quiz') return 'quiz';
    if (t === 'spacerace') return 'spacerace';
    if (t === 'exitticket') return 'exitticket';
    if (t === 'livechat' || t === 'anonymouschat') return 'livechat';
    return null;
  }
  const s = String(value)
    .toLowerCase()
    .replace(/_/g, '');
  if (s === 'quiz') return 'quiz';
  if (s === 'spacerace') return 'spacerace';
  if (s === 'exitticket') return 'exitticket';
  if (s === 'livechat' || s === 'anonymouschat') return 'livechat';
  return null;
}

function claimedActivityId(currentActivity: unknown): string {
  if (!currentActivity || typeof currentActivity !== 'object') return '';
  const row = currentActivity as { activityId?: string; id?: string };
  return String(row.activityId || row.id || '').trim();
}

/**
 * Same labels as Web `getSessionActivityLabel`. Returns null when idle.
 * Quiz expiry is checked on the claimed quiz id (not leftover launched rows),
 * so a live `sessions/{id}.currentActivity` is not hidden by a stale list.
 */
export function getSessionActivityLabel(
  currentActivity: unknown,
  quizzes?: QuizExpiryInput[] | null
): string | null {
  const kind = normalizeSessionCurrentActivity(currentActivity);
  if (!kind) return null;
  if (kind === 'quiz' && Array.isArray(quizzes) && quizzes.length > 0) {
    const claimedId = claimedActivityId(currentActivity);
    if (claimedId) {
      const claimed = quizzes.find((q) => String((q as { id?: string }).id || '') === claimedId);
      if (claimed && !isQuizCurrentlyActive(claimed)) return null;
    } else {
      const launched = quizzes.filter((q) => {
        const s = String(q?.status || '').toLowerCase();
        return q?.launched === true || s === 'launched' || s === 'active';
      });
      if (launched.length > 0 && !launched.some((q) => isQuizCurrentlyActive(q))) {
        return null;
      }
    }
  }

  switch (kind) {
    case 'quiz':
      return 'Active Quiz';
    case 'spacerace':
      return 'Active Space Race';
    case 'exitticket':
      return 'Active Exit Ticket';
    case 'livechat':
      return 'Active Live Chat';
    default:
      return null;
  }
}
