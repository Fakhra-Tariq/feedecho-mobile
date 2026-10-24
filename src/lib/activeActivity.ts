import { router, type Href } from 'expo-router';

import { showAlert } from '@/components/feedback';
import { isQuizCurrentlyActive, type QuizExpiryInput } from '@/lib/quizExpiry';

export type ActiveActivityKind = 'quiz' | 'spacerace' | 'exitticket' | 'livechat' | null;

export type ActiveActivity = {
  type: Exclude<ActiveActivityKind, null>;
  id?: string;
};

export type ActiveActivityMeta = {
  kind: ActiveActivityKind;
  /** Short display name, e.g. "Live Chat" */
  name: string;
  /** Primary CTA label, e.g. "Go to Anonymous Chat" */
  goLabel: string;
  /** Existing host route, or null if unknown */
  href: Href | null;
};

/** Last `sessions/{id}.currentActivity` + quizzes from HostSessionProvider (same as the launch pill). */
let syncedCurrentActivity: unknown = null;
let syncedQuizzes: QuizExpiryInput[] | null = null;
let syncedHostPath = '';

export function syncActiveActivitySource(
  currentActivity: unknown,
  quizzes?: QuizExpiryInput[] | null
) {
  syncedCurrentActivity = currentActivity ?? null;
  if (arguments.length > 1) syncedQuizzes = quizzes ?? null;
}

export function setHostPathname(path: string) {
  syncedHostPath = String(path || '');
}

function stripKind(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalize session.currentActivity (object or string) to a kind. Same types as the launch pill. */
export function normalizeActivityKind(currentActivity: unknown): ActiveActivityKind {
  if (currentActivity == null || currentActivity === '') return null;
  const raw =
    typeof currentActivity === 'object'
      ? String((currentActivity as { type?: string }).type || '')
      : String(currentActivity);
  const kind = stripKind(raw);
  if (!kind) return null;
  if (kind === 'quiz') return 'quiz';
  if (kind === 'spacerace') return 'spacerace';
  if (kind === 'exitticket') return 'exitticket';
  if (kind === 'livechat' || kind === 'anonymouschat') return 'livechat';
  return null;
}

function quizKindIsExpired(kind: ActiveActivityKind, quizzes?: QuizExpiryInput[] | null) {
  if (kind !== 'quiz' || !Array.isArray(quizzes) || quizzes.length === 0) return false;
  const launched = quizzes.filter((q) => {
    const s = String(q?.status || '').toLowerCase();
    return (
      q?.launched === true ||
      q?.launched === 1 ||
      q?.launched === 'true' ||
      s === 'launched' ||
      s === 'active'
    );
  });
  return launched.length > 0 && !launched.some((q) => isQuizCurrentlyActive(q));
}

/**
 * Real active activity from the same `currentActivity` the launch pill uses.
 * Expired quizzes do not count (same `isQuizCurrentlyActive` helper as the pill).
 */
export function getActiveActivity(
  currentActivity: unknown = syncedCurrentActivity,
  quizzes: QuizExpiryInput[] | null = syncedQuizzes
): ActiveActivity | null {
  const source = currentActivity == null ? syncedCurrentActivity : currentActivity;
  const quizList = quizzes == null ? syncedQuizzes : quizzes;
  if (source == null || source === '') return null;
  if (typeof source === 'object') {
    const status = String((source as { status?: string }).status || '').toLowerCase();
    if (status === 'finished') return null;
  }
  const type = normalizeActivityKind(source);
  if (!type) return null;
  if (quizKindIsExpired(type, quizList)) return null;
  let id: string | undefined;
  if (typeof source === 'object' && source) {
    const rawId = (source as { activityId?: string; id?: string }).activityId
      || (source as { id?: string }).id;
    if (rawId != null && String(rawId).trim()) id = String(rawId);
  }
  return id ? { type, id } : { type };
}

const ACTIVITY_COPY: Record<
  Exclude<ActiveActivityKind, null>,
  { name: string; goLabel: string; href: Href; pathMatch: RegExp }
> = {
  livechat: {
    name: 'Live Chat',
    goLabel: 'Go to Anonymous Chat',
    href: '/host/live-chat' as Href,
    pathMatch: /\/host\/live-chat/,
  },
  quiz: {
    name: 'Quiz',
    goLabel: 'Go to Quiz',
    href: '/host/library' as Href,
    pathMatch: /\/host\/(library|quiz)/,
  },
  spacerace: {
    name: 'Space Race',
    goLabel: 'Go to Space Race',
    href: '/host/space-race' as Href,
    pathMatch: /\/host\/space-race/,
  },
  exitticket: {
    name: 'Exit Ticket',
    goLabel: 'Go to Exit Ticket',
    href: '/host/exit-ticket' as Href,
    pathMatch: /\/host\/exit-ticket/,
  },
};

export function metaForActivityKind(kind: ActiveActivityKind): ActiveActivityMeta {
  if (!kind) return { kind: null, name: 'activity', goLabel: '', href: null };
  const row = ACTIVITY_COPY[kind];
  return { kind, name: row.name, goLabel: row.goLabel, href: row.href };
}

function kindFromErrorMessage(errorMessage?: string): ActiveActivityKind {
  const msg = String(errorMessage || '');
  const paren = msg.match(/\((Live Chat|Anonymous Chat|Quiz|Space Race|Exit Ticket)\)/i);
  if (paren) {
    const label = stripKind(paren[1]);
    if (label === 'livechat' || label === 'anonymouschat') return 'livechat';
    if (label === 'quiz') return 'quiz';
    if (label === 'spacerace') return 'spacerace';
    if (label === 'exitticket') return 'exitticket';
  }
  if (/live\s*chat|anonymous\s*chat/i.test(msg)) return 'livechat';
  if (/space\s*race/i.test(msg)) return 'spacerace';
  if (/exit\s*ticket/i.test(msg)) return 'exitticket';
  if (/\bquiz\b/i.test(msg)) return 'quiz';
  return null;
}

function isOnActiveActivityScreen(kind: ActiveActivityKind, pathname = syncedHostPath) {
  if (!kind) return false;
  return ACTIVITY_COPY[kind].pathMatch.test(String(pathname || ''));
}

/** Prefer live session activity (pill source); fall back to arg, then API error text. */
export function resolveActiveActivityMeta(
  currentActivity: unknown,
  errorMessage?: string
): ActiveActivityMeta {
  const fromSync = getActiveActivity(syncedCurrentActivity, syncedQuizzes);
  if (fromSync) return metaForActivityKind(fromSync.type);
  const fromArg = getActiveActivity(currentActivity, syncedQuizzes);
  if (fromArg) return metaForActivityKind(fromArg.type);
  return metaForActivityKind(kindFromErrorMessage(errorMessage));
}

export function isActivityConflictMessage(message: string) {
  return /already active|another activity|activity is already/i.test(String(message || ''));
}

/** User-facing copy — strip obvious technical noise. */
export function cleanErrorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (!msg) return fallback;
    if (/firebase|exception|stack|undefined is not|network request failed/i.test(msg) && msg.length > 120) {
      return fallback;
    }
    return msg;
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

/**
 * Warning card when launch is blocked because another activity is active.
 * Message and Go-to label always come from the real active type (pill source).
 */
export function showActivityBlockedAlert(
  currentActivity?: unknown,
  errorMessage?: string
) {
  const meta = resolveActiveActivityMeta(
    currentActivity === undefined ? syncedCurrentActivity : currentActivity,
    errorMessage
  );
  const article = meta.kind === 'exitticket' ? 'An' : 'A';
  const message = meta.kind
    ? `${article} ${meta.name} is already running. End it first, then launch this activity.`
    : 'Another activity is already running. End it first, then launch this activity.';

  const alreadyThere = isOnActiveActivityScreen(meta.kind);
  const canGo = Boolean(meta.href && meta.goLabel && !alreadyThere);

  showAlert({
    type: 'warning',
    title: "Can't launch yet",
    message,
    ...(canGo
      ? {
          primary: {
            label: meta.goLabel,
            onPress: () => {
              const href = meta.href as Href;
              queueMicrotask(() => router.push(href));
            },
          },
          secondary: { label: 'Close' },
        }
      : {
          primary: { label: 'Close' },
        }),
    dismissOnBackdrop: true,
  });
}

/** @deprecated Use showActivityBlockedAlert — same card. */
export function showActivityConflictAlert(
  currentActivity: unknown,
  errorMessage?: string
) {
  showActivityBlockedAlert(currentActivity, errorMessage);
}

/** Launch failure → conflict card when message matches, else generic error card. */
export function showLaunchFailureAlert(
  currentActivity: unknown,
  error: unknown,
  fallback = 'Try again'
) {
  const message = cleanErrorMessage(error, fallback);
  if (isActivityConflictMessage(message)) {
    showActivityBlockedAlert(
      currentActivity === undefined ? syncedCurrentActivity : currentActivity,
      message
    );
    return;
  }
  showAlert({
    type: 'error',
    title: "Can't launch",
    message,
    primary: { label: 'Close' },
  });
}
