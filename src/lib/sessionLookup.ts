import { get, ref } from 'firebase/database';

import { db } from '../../firebaseConfig';

export type SessionLookup = {
  type: 'session' | 'quiz' | 'spaceRace' | 'exitTicket' | 'liveChat';
  sessionId: string;
  code: string;
};

const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizeSessionCode(code: string) {
  const normalized = String(code || '').trim().toUpperCase();
  return CODE_PATTERN.test(normalized) ? normalized : null;
}

async function readId(path: string) {
  const snap = await get(ref(db, path));
  if (!snap.exists()) return null;
  const value = snap.val();
  return value ? String(value) : null;
}

/**
 * Client-side RTDB code lookup — used only when an authenticated user can read
 * public indexes. Guest Join Session must use POST /sessions/join instead
 * (see AuthContext.joinSession / Web joinSessionByCode); unauthenticated RTDB
 * reads of session_codes/* produce Permission denied under current rules.
 */
export async function lookupSessionByCode(code: string): Promise<SessionLookup> {
  const normalized = normalizeSessionCode(code);
  if (!normalized) {
    throw new Error('Session code must be exactly 6 characters');
  }

  const sessionId = await readId(`session_codes/${normalized}`);
  if (sessionId) {
    try {
      const sessionSnap = await get(ref(db, `sessions/${sessionId}`));
      if (sessionSnap.exists()) {
        const row = sessionSnap.val() || {};
        if (String(row.status || '').toLowerCase() !== 'active') {
          throw new Error('Invalid or expired session code');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid or expired session code') {
        throw error;
      }
    }
    return { type: 'session', sessionId, code: normalized };
  }

  const quizId = await readId(`quiz_codes/${normalized}`);
  if (quizId) return { type: 'quiz', sessionId: quizId, code: normalized };

  const raceId = await readId(`space_race_codes/${normalized}`);
  if (raceId) return { type: 'spaceRace', sessionId: raceId, code: normalized };

  const ticketId = await readId(`exit_ticket_codes/${normalized}`);
  if (ticketId) return { type: 'exitTicket', sessionId: ticketId, code: normalized };

  const chatId = await readId(`chat_join_codes/${normalized}`);
  if (chatId) return { type: 'liveChat', sessionId: chatId, code: normalized };

  throw new Error('Invalid or expired session code');
}
