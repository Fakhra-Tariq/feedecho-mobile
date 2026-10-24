import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';

import {
  appendActivityEntrySource,
  readStoredActivityEntrySource,
  stashActivityEntrySource,
  type ActivityEntrySource,
} from '@/lib/activityEntrySource';

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
  participantId?: string;
  needsTeamSelection?: boolean;
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
  if (!result?.success) return null;

  const code = String(result.code || '')
    .trim()
    .toUpperCase();

  let href: string | null = null;
  if (result.activityType === 'quiz' && result.quizId) {
    href = `/audience/quiz?quizId=${encodeURIComponent(result.quizId)}`;
  } else if (result.activityType === 'liveChat' && code) {
    href = `/audience/live-chat?code=${encodeURIComponent(code)}`;
  } else if (result.activityType === 'exitTicket' && code) {
    href = `/audience/exit-ticket?code=${encodeURIComponent(code)}`;
  } else if (result.activityType === 'spaceRace') {
    const raceQs = result.raceId
      ? `code=${encodeURIComponent(code)}&raceId=${encodeURIComponent(result.raceId)}`
      : `code=${encodeURIComponent(code)}`;
    href = `/audience/space-race?${raceQs}`;
  }
  return href ? appendActivityEntrySource(href, source) : null;
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
  router.replace(href as Href);
  await clearJoinInProgress();
  // Leave pending for EntryGate / audience safety-net one-shot consume.
  return true;
}
