import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';

/**
 * Mirrors Web `client/src/utils/guestAttemptIdentity.js` (same algorithm as
 * server `guestAttemptIdentity.js`). Display names keep the original typing.
 */
const ZERO_WIDTH_AND_CONTROLS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

export const GUEST_ALREADY_ATTEMPTED_MESSAGE =
  'This name has already been used on this device for this activity.';

export function normalizeGuestName(name: string) {
  let s = String(name ?? '');
  try {
    s = s.normalize('NFKC');
  } catch {
    // ignore
  }
  s = s.replace(ZERO_WIDTH_AND_CONTROLS, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLocaleLowerCase();
  return s;
}

function pushId(ids: string[], value: unknown) {
  const id = String(value || '').trim();
  if (id) ids.push(id);
}

/** Older per-activity participant/response ids still count as this device. */
export async function collectLegacyParticipantIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    const raw = await AsyncStorage.getItem('quizParticipantSessions');
    const map = raw ? JSON.parse(raw) : {};
    if (map && typeof map === 'object') {
      Object.values(map).forEach((row: any) => pushId(ids, row?.participantId));
    }
  } catch {
    // ignore
  }
  try {
    const session = JSON.parse((await AsyncStorage.getItem('studentSession')) || 'null');
    pushId(ids, session?.participantId);
  } catch {
    // ignore
  }
  try {
    const subs = JSON.parse((await AsyncStorage.getItem('quizSubmissions')) || '[]');
    if (Array.isArray(subs)) subs.forEach((row) => pushId(ids, row?.participantId));
  } catch {
    // ignore
  }
  try {
    const participant = JSON.parse((await AsyncStorage.getItem('spaceRaceParticipant')) || 'null');
    pushId(ids, participant?.id);
  } catch {
    // ignore
  }
  try {
    const tickets = JSON.parse((await AsyncStorage.getItem('exitTicketSubmissions')) || '[]');
    if (Array.isArray(tickets)) {
      tickets.forEach((row: any) => {
        pushId(ids, row?.responseId);
        pushId(ids, row?.attemptId);
      });
    }
  } catch {
    // ignore
  }
  try {
    const map = JSON.parse((await AsyncStorage.getItem('exitTicketParticipations')) || '{}');
    if (map && typeof map === 'object') {
      Object.values(map).forEach((row: any) => {
        pushId(ids, row?.responseId);
        pushId(ids, row?.attemptId);
      });
    }
  } catch {
    // ignore
  }
  return [...new Set(ids)];
}

export async function goToGuestNameStep(sessionCode?: string | null) {
  try {
    await AsyncStorage.removeItem('studentName');
  } catch {
    // ignore
  }
  let code = String(sessionCode || '').trim().toUpperCase();
  if (!code) {
    try {
      code = String((await AsyncStorage.getItem('sessionCode')) || '')
        .trim()
        .toUpperCase();
    } catch {
      code = '';
    }
  }
  const qs = new URLSearchParams({ useDifferentName: '1' });
  if (code) qs.set('sessionCode', code);
  // /audience/join has no EntryGate, so a guest who already joined can retype a name.
  router.replace(`/audience/join?${qs.toString()}` as Href);
}
