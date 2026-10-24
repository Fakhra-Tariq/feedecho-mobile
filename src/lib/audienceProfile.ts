import { get, ref, update } from 'firebase/database';
import { updateProfile } from 'firebase/auth';

import { auth, db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';

export type AudienceProfileRecord = {
  uid: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  university?: string;
  location?: string;
  phone?: string;
  profileImage?: string | null;
  createdAt?: string | null;
};

/** Same path Web AuthContext / profile uses: users/{uid} */
export async function readAudienceUserProfile(uid: string): Promise<AudienceProfileRecord | null> {
  const snap = await get(ref(db, `users/${uid}`));
  if (!snap.exists()) return null;
  const row = snap.val() || {};
  return {
    uid,
    email: row.email || '',
    displayName: row.displayName || '',
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    bio: row.bio || '',
    university: row.university || '',
    location: row.location || '',
    phone: row.phone || '',
    profileImage: row.profileImage || null,
    createdAt: row.createdAt || null,
  };
}

/** Same contract as Web PUT /auth/profile → users/{uid} fields. */
export async function updateAudienceUserProfile(input: {
  firstName?: string;
  lastName?: string;
  bio?: string;
  university?: string;
  location?: string;
  phone?: string;
  profileImage?: string | null;
}) {
  const response = await apiRequest<{ success?: boolean; user?: AudienceProfileRecord }>(
    '/auth/profile',
    {
      method: 'PUT',
      body: input,
    }
  );

  const user = auth.currentUser;
  if (user && (input.firstName || input.lastName !== undefined)) {
    const displayName =
      response.user?.displayName ||
      `${input.firstName || ''} ${input.lastName ?? ''}`.trim();
    if (displayName) {
      await updateProfile(user, { displayName }).catch(() => undefined);
    }
  }

  return response.user || null;
}

export async function patchLocalAudienceUser(
  uid: string,
  patch: Record<string, unknown>
) {
  await update(ref(db, `users/${uid}`), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}
