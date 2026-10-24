import { getActiveActivity } from '@/lib/activeActivity';
import { type QuizExpiryInput } from '@/lib/quizExpiry';

/**
 * Same as Web `getSessionActivityLabel(currentActivity, quizzes)`:
 * an expired launched quiz is not "Active Quiz".
 */
export function getSessionActivityLabel(
  currentActivity: unknown,
  quizzes?: QuizExpiryInput[] | null
): string {
  const active = getActiveActivity(currentActivity, quizzes ?? null);
  if (!active) return 'No active activity';
  if (active.type === 'quiz') return 'Active Quiz';
  if (active.type === 'spacerace') return 'Active Space Race';
  if (active.type === 'exitticket') return 'Active Exit Ticket';
  if (active.type === 'livechat') return 'Active Live Chat';
  return 'No active activity';
}
