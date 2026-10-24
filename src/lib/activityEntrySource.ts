import AsyncStorage from '@react-native-async-storage/async-storage';

/** Public landing (`Contact Us` / `About`) vs student dashboard Home. */
export type ActivityEntrySource = 'public' | 'student';

export const ACTIVITY_SOURCE_PARAM = 'entrySource';
export const ACTIVITY_SOURCE_STORAGE_KEY = 'activityEntrySource';

/** Sync flag so EntryGate can show landing even if the user is a logged-in student. */
let stayOnPublicHomeSync = false;

export function markStayOnPublicHome() {
  stayOnPublicHomeSync = true;
}

export function clearStayOnPublicHome() {
  stayOnPublicHomeSync = false;
}

export function shouldStayOnPublicHome() {
  return stayOnPublicHomeSync;
}

export function consumeStayOnPublicHome() {
  const next = stayOnPublicHomeSync;
  stayOnPublicHomeSync = false;
  return next;
}

export function parseActivityEntrySource(raw: unknown): ActivityEntrySource | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'public' || value === 'student') return value;
  return null;
}

export function appendActivityEntrySource(href: string, source?: ActivityEntrySource | null) {
  if (!source || !href) return href;
  if (href.includes(`${ACTIVITY_SOURCE_PARAM}=`)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}${ACTIVITY_SOURCE_PARAM}=${source}`;
}

export async function stashActivityEntrySource(source: ActivityEntrySource) {
  await AsyncStorage.setItem(ACTIVITY_SOURCE_STORAGE_KEY, source);
}

export async function readStoredActivityEntrySource(): Promise<ActivityEntrySource | null> {
  const raw = await AsyncStorage.getItem(ACTIVITY_SOURCE_STORAGE_KEY);
  return parseActivityEntrySource(raw);
}

export async function clearStoredActivityEntrySource() {
  await AsyncStorage.removeItem(ACTIVITY_SOURCE_STORAGE_KEY);
}
