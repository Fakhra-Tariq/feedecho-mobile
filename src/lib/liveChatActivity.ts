import { get, ref as dbRef, set } from 'firebase/database';

import { db } from '../../firebaseConfig';
import type { ActivityItem } from '@/lib/studentsActivity';

function rtdbKey(value: string) {
  return String(value || '').replace(/[.#$[\]/]/g, '_');
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: '—', time: '—', shortDate: '', sortKey: iso };
  }
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sortKey: d.toISOString(),
  };
}

/**
 * Display-only student activity for live chat joins.
 * Written under users/{uid}/liveChatActivity/{chatId} (existing user write rule).
 * GET /students/activity does not read this path, so Web is unchanged.
 */
export async function recordLiveChatActivityJoin(input: {
  studentUid?: string | null;
  studentEmail?: string | null;
  studentName?: string | null;
  chatId: string;
  title?: string | null;
}) {
  const studentUid = String(input.studentUid || '').trim();
  const chatId = String(input.chatId || '').trim();
  if (!studentUid || !chatId) return;

  const iso = new Date().toISOString();
  const when = formatWhen(iso);
  const title = String(input.title || '').trim() || 'Live Chat';
  const record = {
    id: `liveChat-${chatId}`,
    type: 'liveChat',
    chatId,
    title,
    subtitle: 'Joined live chat',
    studentUid,
    studentEmail: String(input.studentEmail || '').trim() || null,
    studentName: String(input.studentName || '').trim() || null,
    joinedAt: iso,
    date: when.date,
    time: when.time,
    shortDate: when.shortDate,
    sortKey: when.sortKey,
  };

  await set(dbRef(db, `users/${studentUid}/liveChatActivity/${rtdbKey(chatId)}`), record);
}

export async function loadLiveChatActivityItems(studentUid?: string | null): Promise<ActivityItem[]> {
  const uid = String(studentUid || '').trim();
  if (!uid) return [];
  try {
    const snap = await get(dbRef(db, `users/${uid}/liveChatActivity`));
    if (!snap.exists()) return [];
    const rows = Object.values(snap.val() || {}) as Record<string, unknown>[];
    return rows
      .filter((row) => row && typeof row === 'object')
      .map((row) => {
        const chatId = String(row.chatId || '').trim();
        const joinedAt = String(row.joinedAt || row.sortKey || '');
        const when = formatWhen(joinedAt || new Date().toISOString());
        return {
          id: String(row.id || (chatId ? `liveChat-${chatId}` : '')),
          type: 'liveChat',
          chatId,
          title: String(row.title || '').trim() || 'Live Chat',
          subtitle: 'Joined live chat',
          joinedAt: joinedAt || when.sortKey,
          date: String(row.date || when.date),
          time: String(row.time || when.time),
          shortDate: String(row.shortDate || when.shortDate),
          sortKey: String(row.sortKey || when.sortKey),
        } as ActivityItem;
      })
      .filter((row) => row.id);
  } catch (error) {
    console.warn('[LiveChat activity] failed to load', error);
    return [];
  }
}
