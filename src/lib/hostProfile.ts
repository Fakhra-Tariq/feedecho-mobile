import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { get, ref } from 'firebase/database';

import { auth, db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';

/** Same RTDB path Web HostProfile uses: users/{uid} */
export type HostProfileRecord = {
  uid: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  school?: string;
  subject?: string;
  experience?: string;
  location?: string;
  profileImage?: string | null;
  createdAt?: string | null;
  role?: string;
  roles?: string[];
};

export async function readHostUserProfile(uid: string): Promise<HostProfileRecord | null> {
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
    school: row.school || '',
    subject: row.subject || '',
    experience: row.experience || '',
    location: row.location || '',
    profileImage: row.profileImage || null,
    createdAt: row.createdAt || null,
    role: row.role,
    roles: Array.isArray(row.roles) ? row.roles : undefined,
  };
}

/** Same contract as Web PUT /auth/profile for host fields. */
export async function updateHostUserProfile(input: {
  firstName?: string;
  lastName?: string;
  bio?: string;
  school?: string;
  subject?: string;
  experience?: string;
  location?: string;
  profileImage?: string | null;
}) {
  const response = await apiRequest<{
    message?: string;
    user?: HostProfileRecord;
  }>('/auth/profile', {
    method: 'PUT',
    body: input,
  });

  const user = auth.currentUser;
  if (user) {
    const firebaseProfileUpdate: { displayName?: string; photoURL?: string | null } = {};
    if (input.firstName || input.lastName !== undefined) {
      const displayName =
        response.user?.displayName ||
        `${input.firstName || ''} ${input.lastName ?? ''}`.trim();
      if (displayName) firebaseProfileUpdate.displayName = displayName;
    }
    if (input.profileImage !== undefined) {
      const image = input.profileImage;
      if (image && !String(image).startsWith('data:')) {
        firebaseProfileUpdate.photoURL = image;
      } else if (image === '') {
        firebaseProfileUpdate.photoURL = null;
      }
    }
    if (Object.keys(firebaseProfileUpdate).length > 0) {
      await updateProfile(user, firebaseProfileUpdate).catch(() => undefined);
    }
  }

  return response.user || null;
}

/**
 * Same as Web AuthContext.changeUserPassword:
 * EmailAuthProvider + reauthenticateWithCredential + updatePassword.
 */
export async function changeHostPassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser;
  if (!user) {
    return { success: false as const, error: 'No authenticated user' };
  }

  const hasPasswordProvider = user.providerData?.some(
    (provider) => provider.providerId === 'password'
  );
  if (!hasPasswordProvider) {
    return {
      success: false as const,
      error: 'Password change is not available for accounts signed in with Google.',
    };
  }
  if (!user.email) {
    return { success: false as const, error: 'No email associated with this account.' };
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return { success: true as const };
  } catch (error: any) {
    let errorMessage = 'Failed to update password';
    switch (error?.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        errorMessage = 'Current password is incorrect';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password must be at least 8 characters';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many attempts. Please try again later.';
        break;
      default:
        errorMessage = error?.message || errorMessage;
    }
    return { success: false as const, error: errorMessage };
  }
}

export function hostDisplayName(record: HostProfileRecord | null, fallback = 'Host') {
  if (!record) return fallback;
  const fromDisplay = String(record.displayName || '').trim();
  if (fromDisplay) return fromDisplay;
  const combined = `${record.firstName || ''} ${record.lastName || ''}`.trim();
  return combined || fallback;
}

export function hostInitials(name: string) {
  if (!name) return 'H';
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
