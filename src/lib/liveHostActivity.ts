import { isChatActive, type ChatSession } from '@/lib/anonymousChat';
import { displayTicketStatus, type ExitTicket } from '@/lib/hostExitTickets';
import { type HostQuiz } from '@/lib/hostQuizzes';
import { type SpaceRace } from '@/lib/hostSpaceRaces';
import { isQuizLiveLikeLaunchGuard } from '@/lib/quizExpiry';
import { isLinkedSessionInactive } from '@/lib/sessionActivityMatch';
import { getRaceStatus } from '@/lib/spaceRaceTeams';

export type LiveHostActivityKind = 'quiz' | 'spacerace' | 'exitticket' | 'livechat';

export type LiveHostActivity = {
  type: LiveHostActivityKind;
  id: string;
  title?: string;
  startedAt: string;
};

const LABELS: Record<LiveHostActivityKind, string> = {
  livechat: 'Active Live Chat',
  quiz: 'Active Quiz',
  spacerace: 'Active Space Race',
  exitticket: 'Active Exit Ticket',
};

function recencyStamp(value: unknown) {
  return String(value || '');
}

function rowStamp(row: Record<string, unknown>) {
  return (
    recencyStamp(row.startedAt) ||
    recencyStamp(row.launchedAt) ||
    recencyStamp(row.updatedAt) ||
    recencyStamp(row.lastActivity) ||
    recencyStamp(row.createdAt)
  );
}

/**
 * Pill text must be derived from live activity statuses (not sessions.currentActivity),
 * so End / launch / expiry update it without a stale cached field.
 */
export function pickLiveHostActivity(input: {
  chats?: ChatSession[] | null;
  quizzes?: HostQuiz[] | null;
  races?: SpaceRace[] | null;
  tickets?: ExitTicket[] | null;
  sessions?: Array<{ id?: string; sessionCode?: string; status?: string }> | null;
  now?: number;
}): LiveHostActivity | null {
  const now = input.now ?? Date.now();
  const sessions = input.sessions || [];
  const candidates: LiveHostActivity[] = [];

  (input.chats || []).forEach((chat) => {
    if (!isChatActive(chat) || !chat.id) return;
    if (isLinkedSessionInactive(chat as Record<string, unknown>, sessions)) return;
    candidates.push({
      type: 'livechat',
      id: String(chat.id),
      title: chat.title,
      startedAt: rowStamp(chat as Record<string, unknown>),
    });
  });

  (input.quizzes || []).forEach((quiz) => {
    if (!isQuizLiveLikeLaunchGuard(quiz, now) || !quiz.id) return;
    if (isLinkedSessionInactive(quiz as Record<string, unknown>, sessions)) return;
    candidates.push({
      type: 'quiz',
      id: String(quiz.id),
      title: quiz.title,
      startedAt: rowStamp(quiz as Record<string, unknown>),
    });
  });

  (input.races || []).forEach((race) => {
    if (getRaceStatus(race) !== 'active' || !race.id) return;
    if (isLinkedSessionInactive(race as Record<string, unknown>, sessions)) return;
    candidates.push({
      type: 'spacerace',
      id: String(race.id),
      title: race.title,
      startedAt: rowStamp(race as Record<string, unknown>),
    });
  });

  (input.tickets || []).forEach((ticket) => {
    if (displayTicketStatus(ticket.status) !== 'active' || !ticket.id) return;
    if (isLinkedSessionInactive(ticket as Record<string, unknown>, sessions)) return;
    candidates.push({
      type: 'exitticket',
      id: String(ticket.id),
      title: ticket.title,
      startedAt: rowStamp(ticket as Record<string, unknown>),
    });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return candidates[0];
}

export function liveHostActivityLabel(activity: LiveHostActivity | null) {
  if (!activity) return 'No active activity';
  return LABELS[activity.type];
}

/** Helper under disabled launch buttons (same style as "Requires an active session"). */
export const ANOTHER_ACTIVITY_LIVE_HINT = 'Another activity is live';

/**
 * True when some other activity is already live.
 * Re-launching / finishing the same activity is allowed.
 */
export function liveActivityBlocksLaunch(
  live: LiveHostActivity | null | undefined,
  launching?: { type: LiveHostActivityKind; id?: string | null }
): boolean {
  if (!live) return false;
  if (
    launching?.id &&
    live.type === launching.type &&
    String(live.id) === String(launching.id)
  ) {
    return false;
  }
  return true;
}
