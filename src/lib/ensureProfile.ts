import { update, get, ref, set } from 'firebase/database';
import type { User } from 'firebase/auth';

import { db } from '../../firebaseConfig';
import { apiRequest, ApiError } from '@/lib/api';

type EnsureRole = 'teacher' | 'student';

type BackendUser = {
  uid?: string;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  roles?: string[];
};

function buildInitialRoles(role: EnsureRole) {
  return role === 'teacher' ? ['teacher', 'student'] : ['student'];
}

function normalizeRoles(record: { role?: string; roles?: string[] } | null) {
  if (!record) return [] as string[];
  if (Array.isArray(record.roles) && record.roles.length > 0) {
    return record.roles.filter(
      (r) => r === 'teacher' || r === 'student' || r === 'admin'
    );
  }
  if (record.role === 'teacher' || record.role === 'student' || record.role === 'admin') {
    return [record.role];
  }
  return [];
}

/**
 * Same contract as Web AuthContext.syncProfileFromBackend:
 * POST /auth/ensure-profile then POST /auth/login, with Firebase-only RTDB fallback.
 */
export async function syncProfileFromBackend(
  firebaseUser: User,
  role: EnsureRole,
  firstName?: string,
  lastName?: string,
  { mergeRole = false }: { mergeRole?: boolean } = {}
): Promise<BackendUser> {
  const idToken = await firebaseUser.getIdToken();

  try {
    await apiRequest('/auth/ensure-profile', {
      method: 'POST',
      auth: false,
      body: {
        idToken,
        role,
        firstName,
        lastName,
        mergeRole,
      },
    });
    const login = await apiRequest<{ user?: BackendUser }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { idToken },
    });
    const u = login.user || {};
    return { ...u, uid: u.uid || firebaseUser.uid };
  } catch (error) {
    // Mirror Web: if backend is down, use Firebase + RTDB users/{uid}
    if (error instanceof ApiError && error.status >= 500) {
      return ensureLocalUserProfile(firebaseUser, role, firstName, lastName, mergeRole);
    }
    if (
      error instanceof ApiError &&
      (error.status === 0 || error.status === 401 || error.message.includes('Network'))
    ) {
      return ensureLocalUserProfile(firebaseUser, role, firstName, lastName, mergeRole);
    }
    // Network / cold start
    return ensureLocalUserProfile(firebaseUser, role, firstName, lastName, mergeRole);
  }
}

async function ensureLocalUserProfile(
  firebaseUser: User,
  role: EnsureRole,
  firstName?: string,
  lastName?: string,
  mergeRole = false
): Promise<BackendUser> {
  const uid = firebaseUser.uid;
  const userPath = ref(db, `users/${uid}`);
  const snap = await get(userPath);

  if (snap.exists()) {
    const existing = (snap.val() || {}) as Record<string, unknown> & {
      role?: string;
      roles?: string[];
      firstName?: string;
      lastName?: string;
      displayName?: string;
    };
    const currentRoles = normalizeRoles(existing);
    if (mergeRole) {
      const rolesToAdd = buildInitialRoles(role);
      const mergedRoles = [...new Set([...currentRoles, ...rolesToAdd])];
      if (mergedRoles.length !== currentRoles.length) {
        const updateData: Record<string, unknown> = {
          roles: mergedRoles,
          updatedAt: new Date().toISOString(),
        };
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (firstName || lastName) {
          updateData.displayName =
            `${firstName || existing.firstName || ''} ${lastName || existing.lastName || ''}`.trim();
        }
        await update(userPath, updateData);
      }
    }
    const refreshed = (await get(userPath)).val() || existing;
    return {
      uid,
      email: firebaseUser.email || String(refreshed.email || ''),
      displayName: String(refreshed.displayName || firebaseUser.displayName || ''),
      firstName: String(refreshed.firstName || ''),
      lastName: String(refreshed.lastName || ''),
      role: String(refreshed.role || role),
      roles: normalizeRoles(refreshed),
    };
  }

  const roles = buildInitialRoles(role);
  const displayName =
    firebaseUser.displayName ||
    `${firstName || ''} ${lastName || ''}`.trim() ||
    firebaseUser.email ||
    'User';

  const payload = {
    uid,
    email: firebaseUser.email || null,
    firstName: firstName || '',
    lastName: lastName || '',
    displayName,
    role: roles[0],
    roles,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
    profileImage: firebaseUser.photoURL || null,
    bio: '',
    preferences: {
      notifications: true,
      emailUpdates: true,
      theme: 'light',
    },
  };

  await set(userPath, payload);
  return {
    uid,
    email: firebaseUser.email || '',
    displayName,
    firstName: firstName || '',
    lastName: lastName || '',
    role: roles[0],
    roles,
  };
}

export function canAccessTeacherPortal(profile: BackendUser | null) {
  const roles = normalizeRoles(profile);
  return roles.includes('teacher') || roles.includes('admin');
}

export function canAccessStudentPortal(profile: BackendUser | null) {
  const roles = normalizeRoles(profile);
  return roles.includes('student') || roles.includes('teacher') || roles.includes('admin');
}
