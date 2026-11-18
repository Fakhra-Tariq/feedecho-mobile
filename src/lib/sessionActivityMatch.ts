export type SessionActivityKind = 'quiz' | 'spacerace' | 'exitticket' | 'livechat';

export type SessionMatchInput = {
  id?: string;
  sessionCode?: string;
  currentActivity?: unknown;
  activityHistory?: Record<string, unknown> | unknown[] | null;
};

function upper(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function normalizeSessionActivityKind(value: unknown): SessionActivityKind | null {
  const t = String(value || '')
    .toLowerCase()
    .replace(/_/g, '');
  if (t === 'quiz') return 'quiz';
  if (t === 'spacerace') return 'spacerace';
  if (t === 'exitticket') return 'exitticket';
  if (t === 'livechat' || t === 'anonymouschat') return 'livechat';
  return null;
}

export function resolveSessionCurrentActivity(session: SessionMatchInput | null | undefined): {
  kind: SessionActivityKind;
  id: string;
} | null {
  const raw = session?.currentActivity as
    | { type?: string; activityId?: string; id?: string; status?: string }
    | string
    | null
    | undefined;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const kind = normalizeSessionActivityKind(raw);
    return kind ? { kind, id: '' } : null;
  }
  if (typeof raw === 'object') {
    if (raw.status && String(raw.status).toLowerCase() === 'finished') return null;
    const kind = normalizeSessionActivityKind(raw.type);
    const id = String(raw.activityId || raw.id || '').trim();
    if (!kind) return null;
    return { kind, id };
  }
  return null;
}

export function activityJoinCodes(activity: Record<string, unknown> | null | undefined): string[] {
  if (!activity) return [];
  const launch = activity.launchSettings as { accessCode?: string } | undefined;
  return [activity.sessionCode, activity.joinCode, activity.accessCode, launch?.accessCode]
    .map(upper)
    .filter(Boolean);
}

export function activitySessionOwnerId(activity: Record<string, unknown> | null | undefined) {
  return String(
    activity?.sessionId || activity?.standaloneSessionId || activity?.hostSessionId || ''
  ).trim();
}

export function activityBelongsToSession(
  activity: Record<string, unknown> | null | undefined,
  session: SessionMatchInput
): boolean {
  if (!activity) return false;
  const sessionCode = upper(session.sessionCode);
  const sessionId = String(session.id || '').trim();
  const ownerSession = activitySessionOwnerId(activity);
  if (sessionId && ownerSession && ownerSession === sessionId) return true;
  if (sessionCode && activityJoinCodes(activity).includes(sessionCode)) return true;
  return false;
}

/** Session row this activity was launched into (id or join/session code). */
export function findLinkedSession<T extends { id?: string; sessionCode?: string; status?: string }>(
  activity: Record<string, unknown> | null | undefined,
  sessions: T[] | null | undefined
): T | null {
  if (!activity || !sessions?.length) return null;
  const matches = sessions.filter((session) => activityBelongsToSession(activity, session));
  if (!matches.length) return null;
  return (
    matches.find((session) => String(session.status || '').toLowerCase() === 'active') ||
    matches[0]
  );
}

export function isClaimedCurrentActivity(
  kind: SessionActivityKind,
  activityId: string | null | undefined,
  session: SessionMatchInput | null | undefined
) {
  const id = String(activityId || '').trim();
  if (!id) return false;
  const claimed = resolveSessionCurrentActivity(session);
  return Boolean(claimed && claimed.kind === kind && claimed.id === id);
}

/**
 * Display rule: a launched activity is not "Active" if its session is ended.
 * Does not write Firebase — end-session still has to persist status.
 */
export function isLinkedSessionInactive(
  activity: Record<string, unknown> | null | undefined,
  sessions: Array<{ id?: string; sessionCode?: string; status?: string }> | null | undefined
): boolean {
  const linked = findLinkedSession(activity, sessions);
  if (!linked) return false;
  return String(linked.status || '').toLowerCase() !== 'active';
}

export function historyActivityIds(session: SessionMatchInput, kind: SessionActivityKind): Set<string> {
  const ids = new Set<string>();
  const raw = session.activityHistory;
  if (raw && typeof raw === 'object') {
    const list = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([id, value]) => ({
          id,
          ...((value && typeof value === 'object' ? value : {}) as object),
        }));
    list.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as { type?: string; id?: string; activityId?: string };
      if (normalizeSessionActivityKind(row.type) !== kind) return;
      // Prefer activityId. `id` on a history object is the push key, not the quiz/race id.
      const id = String(row.activityId || '').trim();
      if (id) ids.add(id);
    });
  }
  const current = resolveSessionCurrentActivity(session);
  if (current?.kind === kind && current.id) ids.add(current.id);
  return ids;
}
