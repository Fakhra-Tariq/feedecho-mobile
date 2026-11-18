import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';

import {
  appendActivityEntrySource,
  readStoredActivityEntrySource,
  stashActivityEntrySource,
  type ActivityEntrySource,
} from '@/lib/activityEntrySource';
import { isGuestSessionSync } from '@/lib/guestSession';

/** Expo Router SDK 58 matches nested screens more reliably with pathname+params. */
export function hrefToRouterTarget(href: string): Href {
  const q = href.indexOf('?');
  const pathname = q === -1 ? href : href.slice(0, q);
  const search = q === -1 ? '' : href.slice(q + 1);
  if (!search) return pathname as Href;
  const params: Record<string, string> = {};
  for (const part of search.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq === -1 ? part : part.slice(0, eq);
    const value = eq === -1 ? '' : part.slice(eq + 1);
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return { pathname, params } as Href;
}

/** Guest banner "Log in" — push Join Session on top of the activity (do not replace). */
export async function pushJoinSessionFromBanner() {
  let sessionCode = '';
  let studentName = '';
  try {
    sessionCode = String((await AsyncStorage.getItem(SESSION_CODE_KEY)) || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    studentName = String((await AsyncStorage.getItem('studentName')) || '').trim();
  } catch {
    // keep empty; Join Session still opens
  }
  const qs = new URLSearchParams({ fromBanner: '1' });
  if (sessionCode) qs.set('sessionCode', sessionCode);
  if (studentName) qs.set('studentName', studentName);
  router.push(hrefToRouterTarget(`/audience/join?${qs.toString()}`));
}

/**
 * Shared post-join navigation for guest (/join) and logged-in dashboard join.
 * Mirrors Web proceedWithSessionJoin destinations from POST /sessions/join
 * (server resolves sessions/{id}.currentActivity).
 */

export type JoinActivityType = 'quiz' | 'spaceRace' | 'exitTicket' | 'liveChat';

export type JoinSessionNavResult = {
  success: boolean;
  error?: string;
  activityType?: JoinActivityType | string | null;
  code?: string;
  raceId?: string;
  quizId?: string;
  ticketId?: string;
  participantId?: string;
  needsTeamSelection?: boolean;
  alreadySubmitted?: boolean;
  alreadyAttemptedOnDevice?: boolean;
};

const SESSION_CODE_KEY = 'sessionCode';
const JOIN_ACTIVITY_KEY = 'joinActivityType';
/** Persisted activity destination; EntryGate / audience layout consume this once. */
export const PENDING_JOIN_HREF_KEY = 'pendingJoinHref';
/** AsyncStorage mirror of in-flight join (survives brief remounts). */
export const JOIN_IN_PROGRESS_KEY = 'joinInProgress';

/** Sync flag — RoleRedirect must not treat null pending href as "fresh student" mid-join. */
let joinInProgressSync = false;
/** Set when navigateToJoinedActivity already applied a route (EntryGate must not override to /audience). */
let lastAppliedJoinHref: string | null = null;

export function isJoinInProgressSync() {
  return joinInProgressSync;
}

export function getLastAppliedJoinHref() {
  return lastAppliedJoinHref;
}

export function clearLastAppliedJoinHref() {
  lastAppliedJoinHref = null;
}

/** Student leave / logout: stop auto-opening the last joined activity. */
export async function clearJoinedActivityRedirect() {
  lastAppliedJoinHref = null;
  await AsyncStorage.removeItem(PENDING_JOIN_HREF_KEY);
  await clearJoinInProgress();
}

export async function markJoinInProgress() {
  joinInProgressSync = true;
  lastAppliedJoinHref = null;
  await AsyncStorage.setItem(JOIN_IN_PROGRESS_KEY, '1');
}

export async function clearJoinInProgress() {
  joinInProgressSync = false;
  await AsyncStorage.removeItem(JOIN_IN_PROGRESS_KEY);
}

export function hrefForJoinedActivity(
  result: JoinSessionNavResult,
  source?: ActivityEntrySource | null
): string | null {
  if (!result?.success || result.needsTeamSelection) return null;

  const code = String(result.code || '')
    .trim()
    .toUpperCase();

  const submittedQs = result.alreadySubmitted ? '&alreadySubmitted=1' : '';
  const attemptedQs = result.alreadyAttemptedOnDevice ? '&alreadyAttemptedOnDevice=1' : '';
  let href: string | null = null;
  if (result.activityType === 'quiz' && result.quizId) {
    href = `/audience/quiz?quizId=${encodeURIComponent(result.quizId)}${submittedQs}${attemptedQs}`;
  } else if (result.activityType === 'liveChat' && code) {
    href = `/audience/live-chat?code=${encodeURIComponent(code)}`;
  } else if (result.activityType === 'exitTicket' && code) {
    href = `/audience/exit-ticket?code=${encodeURIComponent(code)}${submittedQs}${attemptedQs}`;
  } else if (result.activityType === 'spaceRace') {
    const raceQs = result.raceId
      ? `code=${encodeURIComponent(code)}&raceId=${encodeURIComponent(result.raceId)}`
      : `code=${encodeURIComponent(code)}`;
    href = `/audience/space-race?${raceQs}${attemptedQs}`;
  }
  if (!href) return null;
  const withSource = appendActivityEntrySource(href, source);
  const guestJoin = source === 'public' || isGuestSessionSync();
  if (!guestJoin || withSource.includes('isGuestSession=')) return withSource;
  return `${withSource}${withSource.includes('?') ? '&' : '?'}isGuestSession=1`;
}

/** Write pending href before AuthContext flips isStudent (EntryGate must see this). */
export async function stashPendingJoinHref(
  result: JoinSessionNavResult,
  source?: ActivityEntrySource | null
) {
  const resolved = source || (await readStoredActivityEntrySource());
  const href = hrefForJoinedActivity(result, resolved);
  if (!href) return null;
  await AsyncStorage.setItem(PENDING_JOIN_HREF_KEY, href);
  return href;
}

/** Read + clear pending activity href (one-shot). */
export async function consumePendingJoinHref(): Promise<string | null> {
  const href = await AsyncStorage.getItem(PENDING_JOIN_HREF_KEY);
  if (href) await AsyncStorage.removeItem(PENDING_JOIN_HREF_KEY);
  return href;
}

/**
 * Resolve where a post-join student should go.
 * Retries briefly if join-in-progress but href not yet visible (storage flush).
 */
export async function resolvePendingJoinHref(options?: {
  retries?: number;
  delayMs?: number;
}): Promise<string | null> {
  const retries = options?.retries ?? 3;
  const delayMs = options?.delayMs ?? 40;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const href = await AsyncStorage.getItem(PENDING_JOIN_HREF_KEY);
    if (href) {
      await AsyncStorage.removeItem(PENDING_JOIN_HREF_KEY);
      await clearJoinInProgress();
      return href;
    }
    const inProgress =
      joinInProgressSync || (await AsyncStorage.getItem(JOIN_IN_PROGRESS_KEY)) === '1';
    if (!inProgress || attempt === retries) break;
    await new Promise((r) => setTimeout(r, delayMs));
  }

  await clearJoinInProgress();
  return null;
}

export async function navigateToJoinedActivity(
  result: JoinSessionNavResult,
  source?: ActivityEntrySource | null
): Promise<boolean> {
  if (!result?.success) {
    await clearJoinInProgress();
    return false;
  }

  const code = String(result.code || '')
    .trim()
    .toUpperCase();
  if (code) {
    await AsyncStorage.setItem(SESSION_CODE_KEY, code);
  }
  if (result.activityType) {
    await AsyncStorage.setItem(JOIN_ACTIVITY_KEY, String(result.activityType));
  }
  if (source === 'public' || source === 'student') {
    await stashActivityEntrySource(source);
  }

  const href = hrefForJoinedActivity(result, source);
  if (!href) {
    await clearJoinInProgress();
    return false;
  }

  lastAppliedJoinHref = href;
  await AsyncStorage.setItem(PENDING_JOIN_HREF_KEY, href);
  const target = hrefToRouterTarget(href);
  // TEMP DEBUG — remove after guest join is confirmed
  console.log('[TEMP DEBUG] navigateToJoinedActivity replace', {
    href,
    target,
    source: source || null,
    activityType: result.activityType,
    code,
    guestSession: isGuestSessionSync(),
  });
  router.replace(target);
  await clearJoinInProgress();
  // Leave pending for EntryGate / audience safety-net one-shot consume.
  return true;
}
