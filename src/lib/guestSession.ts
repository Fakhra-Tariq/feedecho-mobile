import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Explicit guest-join marker (not Firebase anonymous auth).
 * Set BEFORE navigating off the public Join screen so guards can tell a
 * code-join guest from a logged-in student. Logged-in students never set this.
 */
export const GUEST_SESSION_KEY = 'feedEcho_guestSession';

let guestSessionSync = false;

export function isGuestSessionSync() {
  return guestSessionSync;
}

export function markGuestSessionActive() {
  guestSessionSync = true;
  void AsyncStorage.setItem(GUEST_SESSION_KEY, '1');
}

export function clearGuestSession() {
  guestSessionSync = false;
  void AsyncStorage.removeItem(GUEST_SESSION_KEY);
}

export async function hydrateGuestSessionFromStorage() {
  const raw = await AsyncStorage.getItem(GUEST_SESSION_KEY);
  guestSessionSync = raw === '1';
  return guestSessionSync;
}

/** Hosts and Firebase-signed-in students are never code-join guests. */
export function isCodeJoinGuest(input: {
  profileGuest?: boolean;
  isHost?: boolean;
  firebaseUid?: string | null;
}) {
  if (input.isHost) return false;
  if (input.firebaseUid) return false;
  return Boolean(input.profileGuest) || guestSessionSync;
}

export function isAudienceActivityPath(pathname: string | null | undefined) {
  const path = String(pathname || '');
  return (
    path.includes('/audience/live-chat') ||
    path.includes('/audience/quiz') ||
    path.includes('/audience/space-race') ||
    path.includes('/audience/exit-ticket')
  );
}
