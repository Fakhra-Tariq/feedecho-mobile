import AsyncStorage from '@react-native-async-storage/async-storage';

import { collectLegacyParticipantIds } from '@/lib/guestAttemptIdentity';

/** Same key as Web localStorage `feedecho_device_id`. */
export const AUDIENCE_DEVICE_ID_STORAGE_KEY = 'feedecho_device_id';

function mintDeviceId() {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid =
    typeof g.crypto?.randomUUID === 'function'
      ? g.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  return `dev-${uuid}`;
}

function isValidDeviceId(value: string) {
  return /^dev-[0-9a-f-]{8,}$/i.test(String(value || '').trim());
}

/** One stable id per install. Reinstall / clear app data mints a new id (accepted). */
export async function getAudienceDeviceId(): Promise<string> {
  try {
    const stored = String((await AsyncStorage.getItem(AUDIENCE_DEVICE_ID_STORAGE_KEY)) || '').trim();
    if (isValidDeviceId(stored)) return stored;
  } catch {
    // mint below
  }
  const id = mintDeviceId();
  try {
    await AsyncStorage.setItem(AUDIENCE_DEVICE_ID_STORAGE_KEY, id);
  } catch {
    // still send this session's id
  }
  return id;
}

/** Fields the Web join/start/submit bodies send for guests. */
export async function guestDevicePayload() {
  return {
    deviceId: await getAudienceDeviceId(),
    legacyParticipantIds: await collectLegacyParticipantIds(),
  };
}
