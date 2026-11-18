import { equalTo, off, onValue, orderByChild, query, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';

/** Same paths as Web `HostRealtimeSyncContext.js` lines 31–33. */
export const HOST_PING_PATHS = ['quizzes', 'exit_tickets', 'spaceRaces', 'chat_sessions'] as const;

/** Web `HostRealtimeSyncContext` bump debounce (line 24) and HostDataContext revision delay (line 1141). */
export const HOST_PING_DEBOUNCE_MS = 450;

/** Web `HostDataContext` lastBulkSync skip window (line 1145). */
export const HOST_PING_MIN_INTERVAL_MS = 3000;

/** Safety net while a host screen is mounted — not faster than 30s. */
export const HOST_SAFETY_POLL_MS = 45000;

export function attachHostCreatedByPings(
  uid: string,
  onPing: (path: string) => void,
  onError: (path: string, error: Error) => void
) {
  const teacherUid = String(uid || '').trim();
  if (!teacherUid) {
    return () => undefined;
  }

  const unsubs = HOST_PING_PATHS.map((path) => {
    const r = query(dbRef(db, path), orderByChild('createdBy'), equalTo(teacherUid));
    return onValue(
      r,
      () => onPing(path),
      (error) => onError(path, error)
    );
  });

  return () => {
    unsubs.forEach((unsub, i) => {
      try {
        unsub();
      } catch {
        off(dbRef(db, HOST_PING_PATHS[i]));
      }
    });
  };
}

/** Session create/end does not touch the four activity trees; ping this node then REST. */
export function attachTeacherActiveSessionPing(
  uid: string,
  onPing: () => void,
  onError: (error: Error) => void
) {
  const teacherUid = String(uid || '').trim();
  if (!teacherUid) {
    return () => undefined;
  }
  const pointerPath = `activeSession/byTeacher/${teacherUid}`;
  const pointerRef = dbRef(db, pointerPath);
  const unsub = onValue(
    pointerRef,
    () => onPing(),
    (error) => onError(error)
  );
  return () => {
    try {
      unsub();
    } catch {
      off(pointerRef);
    }
  };
}

export function attachFirebaseConnectedPing(onReconnect: () => void, onError: (error: Error) => void) {
  const connectedRef = dbRef(db, '.info/connected');
  let wasConnected = false;
  const unsub = onValue(
    connectedRef,
    (snap) => {
      const connected = snap.val() === true;
      if (connected && wasConnected === false) {
        onReconnect();
      }
      wasConnected = connected;
    },
    (error) => onError(error)
  );
  return () => {
    try {
      unsub();
    } catch {
      off(connectedRef);
    }
  };
}
