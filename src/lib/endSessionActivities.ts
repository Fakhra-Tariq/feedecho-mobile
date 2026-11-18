import { get, ref } from 'firebase/database';

import { db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';
import {
  endAnonymousChat,
  getChatByCode,
  isChatActive,
  listAnonymousChats,
  type ChatSession,
} from '@/lib/anonymousChat';
import {
  displayTicketStatus,
  endExitTicket,
  getExitTicketByCode,
  listExitTickets,
  type ExitTicket,
} from '@/lib/hostExitTickets';
import { finishQuiz, listTeacherQuizzes, quizBucket, type HostQuiz } from '@/lib/hostQuizzes';
import { endSpaceRace, getRaceByCode, listSpaceRaces, type SpaceRace } from '@/lib/hostSpaceRaces';
import { readTeacherSessionById, type HostSession } from '@/lib/hostSessions';
import { getRaceStatus } from '@/lib/spaceRaceTeams';
import {
  activityBelongsToSession,
  historyActivityIds,
  resolveSessionCurrentActivity,
  type SessionActivityKind,
} from '@/lib/sessionActivityMatch';

export type { SessionActivityKind } from '@/lib/sessionActivityMatch';
export {
  activityBelongsToSession,
  activityJoinCodes,
  resolveSessionCurrentActivity,
} from '@/lib/sessionActivityMatch';

export type EndSessionActivityCatalog = {
  races?: Array<SpaceRace & { id?: string }>;
  quizzes?: HostQuiz[];
  tickets?: Array<ExitTicket & { id?: string }>;
  chats?: Array<ChatSession & { id?: string }>;
};

/** Last `endOpenActivitiesForSession` run: how many still-open activities were ended. */
export let lastEndedOpenActivityCount = 0;

function activityIdOf(row: { id?: string; raceId?: string } | null | undefined) {
  return String(row?.id || row?.raceId || '').trim();
}

function mergeById<T extends { id?: string; raceId?: string }>(lists: Array<T[] | undefined>): T[] {
  const map = new Map<string, T>();
  lists.forEach((list) => {
    (list || []).forEach((row) => {
      const id = activityIdOf(row);
      if (!id) return;
      map.set(id, { ...row, id } as T);
    });
  });
  return [...map.values()];
}

function isBenignEndError(error: unknown) {
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 404) return true;
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('already') ||
    message.includes('completed') ||
    message.includes('ended') ||
    message.includes('finished')
  );
}

async function safeCall(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (error) {
    if (isBenignEndError(error)) return null;
    return error;
  }
}

function idFromPayload(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const row = data as { id?: string; quizId?: string; raceId?: string; ticketId?: string; chatId?: string };
  return String(row.id || row.quizId || row.raceId || row.ticketId || row.chatId || '').trim();
}

/**
 * Same join-code indexes `endSessionActiveActivity.js` uses:
 * quiz_codes / space_race_codes / exit_ticket_codes / chat_join_codes.
 */
async function idFromCodeIndex(path: string, code: string): Promise<string> {
  if (!code) return '';
  try {
    const snap = await get(ref(db, `${path}/${code}`));
    if (!snap.exists()) return '';
    const val = snap.val();
    if (typeof val === 'string' || typeof val === 'number') return String(val).trim();
    if (val && typeof val === 'object') {
      return String(
        (val as { id?: string; quizId?: string; raceId?: string; ticketId?: string; chatId?: string })
          .id ||
          (val as { quizId?: string }).quizId ||
          (val as { raceId?: string }).raceId ||
          (val as { ticketId?: string }).ticketId ||
          (val as { chatId?: string }).chatId ||
          ''
      ).trim();
    }
    return String(val || '').trim();
  } catch {
    return '';
  }
}

async function resolveIdsFromSessionCode(sessionCode: string) {
  const code = String(sessionCode || '')
    .trim()
    .toUpperCase();
  if (!code || code.length !== 6) {
    return { quiz: '', spacerace: '', exitticket: '', livechat: '' };
  }
  const [quizIndex, raceIndex, ticketIndex, chatIndex, quizApi, raceApi, ticketApi, chatApi] =
    await Promise.all([
      idFromCodeIndex('quiz_codes', code),
      idFromCodeIndex('space_race_codes', code),
      idFromCodeIndex('exit_ticket_codes', code),
      idFromCodeIndex('chat_join_codes', code),
      apiRequest<{ success?: boolean; data?: { id?: string } }>(`/quizzes/code/${encodeURIComponent(code)}`, {
        auth: false,
      })
        .then((res) => idFromPayload(res?.data))
        .catch(() => ''),
      getRaceByCode(code)
        .then((res) => idFromPayload(res?.data))
        .catch(() => ''),
      getExitTicketByCode(code)
        .then((res) => idFromPayload(res?.data))
        .catch(() => ''),
      getChatByCode(code)
        .then((res) => idFromPayload(res?.data))
        .catch(() => ''),
    ]);
  return {
    quiz: quizIndex || quizApi,
    spacerace: raceIndex || raceApi,
    exitticket: ticketIndex || ticketApi,
    livechat: chatIndex || chatApi,
  };
}

function isQuizOpen(quiz: HostQuiz) {
  return quizBucket(quiz) === 'launched';
}

function isRaceOpen(race: SpaceRace) {
  const status = getRaceStatus(race);
  return status === 'active';
}

function isTicketOpen(ticket: ExitTicket) {
  const status = String(displayTicketStatus(ticket.status) || '').toLowerCase();
  return status === 'active' || status === 'started' || status === 'live' || status === 'paused';
}

function isLiveChatOpen(chat: ChatSession) {
  const status = String(chat.status || '').toLowerCase();
  if (status === 'ended' || status === 'inactive' || chat.isActive === false) return false;
  if (status === 'active' || status === 'live' || status === 'started') return true;
  return isChatActive(chat);
}

function shouldEndRow(
  row: Record<string, unknown>,
  session: HostSession,
  kind: SessionActivityKind,
  isOpen: boolean
) {
  if (!isOpen) return false;
  const id = activityIdOf(row);
  if (!id) return false;
  if (activityBelongsToSession(row, session)) return true;
  if (historyActivityIds(session, kind).has(id)) return true;
  return false;
}

async function listOwnedFromRtdb<T extends { createdBy?: string }>(
  path: string,
  teacherId: string
): Promise<T[]> {
  try {
    const snap = await get(ref(db, path));
    if (!snap.exists()) return [];
    const uid = String(teacherId || '').trim();
    const rows: T[] = [];
    Object.entries(snap.val() || {}).forEach(([id, value]) => {
      if (!value || typeof value !== 'object') return;
      const row = { ...(value as T), id } as T & { id: string };
      if (uid && row.createdBy && String(row.createdBy) !== uid) return;
      rows.push(row);
    });
    return rows;
  } catch {
    return [];
  }
}

async function loadHostActivityCatalog(
  teacherId: string,
  catalog: EndSessionActivityCatalog
): Promise<Required<EndSessionActivityCatalog>> {
  const uid = String(teacherId || '').trim();
  const [quizzes, races, tickets, chats, rtdbQuizzes, rtdbRaces, rtdbTickets, rtdbChats] =
    await Promise.all([
      listTeacherQuizzes(uid).catch(() => [] as HostQuiz[]),
      listSpaceRaces().catch(() => [] as SpaceRace[]),
      listExitTickets().catch(() => [] as ExitTicket[]),
      listAnonymousChats().catch(() => [] as ChatSession[]),
      listOwnedFromRtdb<HostQuiz>('quizzes', uid),
      listOwnedFromRtdb<SpaceRace>('spaceRaces', uid),
      listOwnedFromRtdb<ExitTicket>('exit_tickets', uid),
      listOwnedFromRtdb<ChatSession>('chat_sessions', uid),
    ]);
  const owned = (row: { createdBy?: string }) =>
    !uid || !row?.createdBy || String(row.createdBy) === uid;
  return {
    quizzes: mergeById([catalog.quizzes, quizzes.filter(owned), rtdbQuizzes]),
    races: mergeById([catalog.races, races.filter(owned), rtdbRaces]),
    tickets: mergeById([catalog.tickets, tickets.filter(owned), rtdbTickets]),
    chats: mergeById([catalog.chats, chats.filter(owned), rtdbChats]),
  };
}

/**
 * End every still-open activity that belongs to this session using the same
 * host APIs as End Race / Finish Quiz / End Ticket / End Chat.
 *
 * Sources (same data Web launch writes):
 * 1) join-code indexes (quiz_codes / space_race_codes / …)
 * 2) sessions/{id}.activityHistory activityIds — every launch in this session
 * 3) sessions/{id}.currentActivity
 * 4) host library rows whose sessionCode/joinCode/sessionId match
 *
 * Drafts and other sessions are skipped. Already-finished rows are ended
 * again through idempotent host APIs.
 */
export async function endOpenActivitiesForSession(
  session: HostSession,
  catalog: EndSessionActivityCatalog = {},
  teacherId = ''
) {
  const fresh = (await readTeacherSessionById(session.id, session)) || session;
  const loaded = await loadHostActivityCatalog(teacherId, catalog);
  const jobs: Array<Promise<unknown>> = [];
  const seen = new Set<string>();

  const rowById = {
    quiz: new Map(loaded.quizzes.map((row) => [activityIdOf(row), row])),
    spacerace: new Map(loaded.races.map((row) => [activityIdOf(row), row])),
    exitticket: new Map(loaded.tickets.map((row) => [activityIdOf(row), row])),
    livechat: new Map(loaded.chats.map((row) => [activityIdOf(row), row])),
  };

  const isOpenId = (kind: SessionActivityKind, id: string) => {
    if (kind === 'quiz') {
      const row = rowById.quiz.get(id);
      return row ? isQuizOpen(row) : true;
    }
    if (kind === 'spacerace') {
      const row = rowById.spacerace.get(id);
      return row ? isRaceOpen(row) : true;
    }
    if (kind === 'exitticket') {
      const row = rowById.exitticket.get(id);
      return row ? isTicketOpen(row) : true;
    }
    const row = rowById.livechat.get(id);
    return row ? isLiveChatOpen(row) : true;
  };

  const enqueue = (
    kind: SessionActivityKind,
    id: string,
    run: () => Promise<unknown>,
    requireOpen = true
  ) => {
    const key = `${kind}:${id}`;
    if (!id || seen.has(key)) return;
    if (requireOpen && !isOpenId(kind, id)) return;
    seen.add(key);
    jobs.push(safeCall(run));
  };

  const fromCodes = await resolveIdsFromSessionCode(fresh.sessionCode);
  if (fromCodes.quiz) enqueue('quiz', fromCodes.quiz, () => finishQuiz(fromCodes.quiz), false);
  if (fromCodes.spacerace) {
    enqueue('spacerace', fromCodes.spacerace, () => endSpaceRace(fromCodes.spacerace), false);
  }
  if (fromCodes.exitticket) {
    enqueue('exitticket', fromCodes.exitticket, () => endExitTicket(fromCodes.exitticket), false);
  }
  if (fromCodes.livechat) {
    enqueue('livechat', fromCodes.livechat, () => endAnonymousChat(fromCodes.livechat), false);
  }

  historyActivityIds(fresh, 'quiz').forEach((id) => enqueue('quiz', id, () => finishQuiz(id)));
  historyActivityIds(fresh, 'spacerace').forEach((id) =>
    enqueue('spacerace', id, () => endSpaceRace(id))
  );
  historyActivityIds(fresh, 'exitticket').forEach((id) =>
    enqueue('exitticket', id, () => endExitTicket(id))
  );
  historyActivityIds(fresh, 'livechat').forEach((id) =>
    enqueue('livechat', id, () => endAnonymousChat(id))
  );

  const current = resolveSessionCurrentActivity(fresh);
  if (current?.id) {
    if (current.kind === 'spacerace') {
      enqueue('spacerace', current.id, () => endSpaceRace(current.id), false);
    }
    if (current.kind === 'quiz') enqueue('quiz', current.id, () => finishQuiz(current.id), false);
    if (current.kind === 'exitticket') {
      enqueue('exitticket', current.id, () => endExitTicket(current.id), false);
    }
    if (current.kind === 'livechat') {
      enqueue('livechat', current.id, () => endAnonymousChat(current.id), false);
    }
  }

  loaded.races.forEach((race) => {
    const id = activityIdOf(race);
    if (!shouldEndRow(race as Record<string, unknown>, fresh, 'spacerace', isRaceOpen(race))) return;
    enqueue('spacerace', id, () => endSpaceRace(id));
  });

  loaded.quizzes.forEach((quiz) => {
    const id = activityIdOf(quiz);
    if (!shouldEndRow(quiz as Record<string, unknown>, fresh, 'quiz', isQuizOpen(quiz))) return;
    enqueue('quiz', id, () => finishQuiz(id));
  });

  loaded.tickets.forEach((ticket) => {
    const id = activityIdOf(ticket);
    if (!shouldEndRow(ticket as Record<string, unknown>, fresh, 'exitticket', isTicketOpen(ticket))) {
      return;
    }
    enqueue('exitticket', id, () => endExitTicket(id));
  });

  loaded.chats.forEach((chat) => {
    const id = activityIdOf(chat);
    if (!shouldEndRow(chat as Record<string, unknown>, fresh, 'livechat', isLiveChatOpen(chat))) {
      return;
    }
    enqueue('livechat', id, () => endAnonymousChat(id));
  });

  lastEndedOpenActivityCount = seen.size;
  const results = await Promise.all(jobs);
  const failed = results.find((error) => error != null);
  if (failed) {
    throw failed instanceof Error ? failed : new Error(String(failed));
  }
}
