import { get, onValue, ref } from 'firebase/database';

import { auth, db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';
import { notifyHostDataMutated } from '@/lib/hostDataSync';

export type HostSession = {
  id: string;
  sessionName: string;
  sessionCode: string;
  teacherId: string;
  status: string;
  currentActivity: unknown;
  activityHistory: Record<string, unknown> | unknown[] | null;
  createdAt: string;
  updatedAt?: string | null;
  endedAt?: string | null;
  participants: number;
};

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateJoinCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

export function isSessionActive(session: HostSession | null | undefined) {
  return String(session?.status || '').toLowerCase() === 'active';
}

export type SessionActivityEntry = {
  id?: string;
  type?: string;
  name?: string;
  launchedAt?: string;
};

export function parseActivityHistory(session: HostSession | null | undefined): SessionActivityEntry[] {
  const raw = session?.activityHistory;
  if (!raw || typeof raw !== 'object') return [];
  const list: SessionActivityEntry[] = Array.isArray(raw)
    ? (raw as SessionActivityEntry[])
    : Object.entries(raw).map(([id, value]) => ({
        id,
        ...((value && typeof value === 'object' ? value : {}) as SessionActivityEntry),
      }));
  return list
    .filter((entry) => entry && typeof entry === 'object')
    .sort((a, b) => String(b.launchedAt || '').localeCompare(String(a.launchedAt || '')));
}

function activityLabel(type?: string) {
  const kind = String(type || '')
    .toLowerCase()
    .replace(/_/g, '');
  if (kind === 'quiz') return 'Quiz';
  if (kind === 'spacerace') return 'Space Race';
  if (kind === 'exitticket') return 'Exit Ticket';
  if (kind === 'livechat' || kind === 'anonymouschat') return 'Live Chat';
  return 'Activity';
}

export function formatActivityLine(entry: { type?: string; name?: string }) {
  const name = String(entry.name || '').trim() || 'Untitled';
  return `${activityLabel(entry.type)}: ${name}`;
}

function normalizeSession(id: string, value: Record<string, unknown>): HostSession {
  return {
    id: String(value.id || id),
    sessionName: String(value.sessionName || 'Untitled Session'),
    sessionCode: String(value.sessionCode || '').toUpperCase(),
    teacherId: String(value.teacherId || ''),
    status: String(value.status || ''),
    currentActivity: value.currentActivity ?? null,
    activityHistory: (value.activityHistory as HostSession['activityHistory']) || null,
    createdAt: String(value.createdAt || ''),
    updatedAt: value.updatedAt ? String(value.updatedAt) : null,
    endedAt: value.endedAt ? String(value.endedAt) : null,
    participants: Number(value.participants || 0),
  };
}

export function sortTeacherSessions(sessions: HostSession[]) {
  return [...sessions].sort((a, b) => {
    const aActive = isSessionActive(a);
    const bActive = isSessionActive(b);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export type TeacherActivePointer = {
  sessionId: string;
  accessCode: string;
  status: string;
  teacherId: string;
};

/**
 * Same pointer Web HostDataContext hydrates via GET /sessions/active
 * (`activeSession/byTeacher/{teacherId}`).
 */
export function subscribeTeacherActivePointer(
  teacherId: string,
  onChange: (pointer: TeacherActivePointer | null) => void,
  onError?: (error: Error) => void
) {
  const pointerRef = ref(db, `activeSession/byTeacher/${teacherId}`);
  return onValue(
    pointerRef,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const raw = (snap.val() || {}) as Record<string, unknown>;
      const status = String(raw.status || '').toLowerCase();
      const sessionId = String(raw.sessionId || raw.id || '').trim();
      if (status !== 'active' || !sessionId) {
        onChange(null);
        return;
      }
      onChange({
        sessionId,
        accessCode: String(raw.accessCode || raw.joinCode || '').trim().toUpperCase(),
        status,
        teacherId: String(raw.teacherId || teacherId),
      });
    },
    (error) => onError?.(error)
  );
}

/** Live `sessions/{id}` record (currentActivity, status, code) — same as Web HostDataContext. */
export function subscribeSessionRecord(
  sessionId: string,
  onChange: (session: HostSession | null) => void,
  onError?: (error: Error) => void
) {
  const id = String(sessionId || '').trim();
  if (!id) {
    onChange(null);
    return () => undefined;
  }
  const sessionRef = ref(db, `sessions/${id}`);
  return onValue(
    sessionRef,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(normalizeSession(id, (snap.val() || {}) as Record<string, unknown>));
    },
    (error) => onError?.(error)
  );
}

/** Same source Web uses: GET /api/sessions/active */
export async function fetchActiveTeacherSession(teacherId: string) {
  if (!teacherId) return null;
  const result = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown> | null;
    error?: string;
  }>(`/sessions/active?teacherId=${encodeURIComponent(teacherId)}`);
  const row = result?.data;
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || row.sessionId || '').trim();
  if (!id) return null;
  if (String(row.status || '').toLowerCase() !== 'active') return null;
  return normalizeSession(id, row);
}

/** Live list of this teacher's sessions. Full-tree + client filter (same as quizzes). */
export function subscribeTeacherSessions(
  teacherId: string,
  onChange: (sessions: HostSession[]) => void,
  onError?: (error: Error) => void
) {
  const sessionsRef = ref(db, 'sessions');
  return onValue(
    sessionsRef,
    (snap) => {
      const rows: HostSession[] = [];
      if (snap.exists()) {
        const raw = snap.val() || {};
        Object.entries(raw).forEach(([id, value]) => {
          if (!value || typeof value !== 'object') return;
          const row = value as Record<string, unknown>;
          if (String(row.teacherId || '') !== String(teacherId || '')) return;
          rows.push(normalizeSession(id, row));
        });
      }
      onChange(sortTeacherSessions(rows));
    },
    (error) => onError?.(error)
  );
}

/** Same source Web Sessions page uses: GET /api/sessions/teacher/:teacherId */
export async function listTeacherSessions(teacherId: string) {
  if (!teacherId) return [];
  const result = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown>[];
    error?: string;
  }>(`/sessions/teacher/${encodeURIComponent(teacherId)}`);

  const rows = Array.isArray(result.data) ? result.data : [];
  return sortTeacherSessions(
    rows.map((row) => normalizeSession(String(row.id || ''), row))
  );
}

function requireSignedInTeacherId(teacherId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Not signed in. Please sign in again as a host.');
  }
  if (teacherId && teacherId !== uid) {
    throw new Error('Host account mismatch. Please sign out and sign in again.');
  }
  return uid;
}

/**
 * Create a standalone session via the same server API Web uses
 * (POST /sessions/create). The Admin SDK writes:
 *   sessions/{sessionId}, session_codes/{code}, activeSession/byTeacher/{teacherId}
 * Direct client RTDB writes are denied by security rules.
 */
export async function createTeacherSession(sessionName: string, teacherId: string) {
  const trimmed = sessionName.trim();
  if (!trimmed) throw new Error('Please enter a session name');
  const uid = requireSignedInTeacherId(teacherId);

  const result = await apiRequest<{
    success?: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }>('/sessions/create', {
    method: 'POST',
    body: {
      sessionName: trimmed,
      teacherId: uid,
    },
  });

  if (!result?.success || !result.data) {
    throw new Error(result?.error || 'Failed to create session');
  }

  const data = result.data;
  const created = normalizeSession(String(data.id || ''), data);
  notifyHostDataMutated();
  return created;
}

/** Fresh `sessions/{id}` snapshot (activityHistory + currentActivity) before ending. */
export async function readTeacherSessionById(
  sessionId: string,
  fallback?: HostSession | null
): Promise<HostSession | null> {
  const id = String(sessionId || '').trim();
  if (!id) return fallback || null;
  try {
    const snap = await get(ref(db, `sessions/${id}`));
    if (snap.exists()) {
      return normalizeSession(id, (snap.val() || {}) as Record<string, unknown>);
    }
  } catch {
    // Client rules or offline — use the list row we already have.
  }
  return fallback || null;
}

/** End session via POST /sessions/:id/end (same as Web). */
export async function endTeacherSession(session: HostSession, teacherId: string) {
  if (!session?.id) throw new Error('Session not found');
  const uid = requireSignedInTeacherId(teacherId);
  if (session.teacherId && session.teacherId !== uid) {
    throw new Error('Access denied');
  }

  const result = await apiRequest<{ success?: boolean; error?: string }>(
    `/sessions/${session.id}/end`,
    { method: 'POST', body: {} }
  );

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to end session');
  }
  notifyHostDataMutated();
}

/** Delete ended session via DELETE /sessions/:id (same as Web). */
export async function deleteEndedSession(session: HostSession, teacherId: string) {
  if (!session?.id) throw new Error('Session not found');
  const uid = requireSignedInTeacherId(teacherId);
  if (session.teacherId !== uid) throw new Error('Access denied');
  if (isSessionActive(session)) {
    throw new Error('Only ended sessions can be deleted');
  }

  const result = await apiRequest<{ success?: boolean; error?: string }>(
    `/sessions/${session.id}?teacherId=${encodeURIComponent(uid)}`,
    { method: 'DELETE' }
  );

  if (!result?.success) {
    throw new Error(result?.error || 'Failed to delete session');
  }
  notifyHostDataMutated();
}
