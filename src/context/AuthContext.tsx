import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { get, ref } from 'firebase/database';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { auth, db } from '../../firebaseConfig';
import {
  canAccessStudentPortal,
  canAccessTeacherPortal,
  syncProfileFromBackend,
} from '@/lib/ensureProfile';
import { executeSessionJoin, type JoinSessionResult } from '@/lib/joinSessionFlow';
import {
  clearGuestSession,
  hydrateGuestSessionFromStorage,
  isGuestSessionSync,
  markGuestSessionActive,
} from '@/lib/guestSession';
import {
  clearJoinInProgress,
  clearLastAppliedJoinHref,
  JOIN_IN_PROGRESS_KEY,
  markJoinInProgress,
  PENDING_JOIN_HREF_KEY,
  stashPendingJoinHref,
} from '@/lib/joinSessionNavigation';

const ROLE_KEY = 'feedEcho_role';
const PORTAL_KEY = 'feedEcho_last_portal';
const AUDIENCE_KEY = 'loggedInStudent';
const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';
const JOIN_ACTIVITY_KEY = 'joinActivityType';

type Portal = 'teacher' | 'student';
type GooglePrompt = (options?: Record<string, unknown>) => Promise<{
  type: string;
  params?: { id_token?: string };
  authentication?: { idToken?: string };
}>;
const GOOGLE_UNAVAILABLE_MESSAGE =
  "Google sign-in isn't available right now. Use email and password instead.";

export type AppProfile = {
  uid: string;
  email: string;
  name: string;
  role: 'teacher' | 'student';
  roles: string[];
  guest?: boolean;
};

type AuthResult = { success: boolean; error?: string };

type AuthContextValue = {
  user: User | null;
  profile: AppProfile | null;
  portal: Portal | null;
  loading: boolean;
  isHost: boolean;
  isStudent: boolean;
  signInHost: (email: string, password: string) => Promise<AuthResult>;
  signInHostWithGoogle: (promptAsync: GooglePrompt) => Promise<AuthResult>;
  hostSignUp: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<AuthResult>;
  audienceSignIn: (email: string, password: string) => Promise<AuthResult>;
  audienceSignInWithGoogle: (promptAsync: GooglePrompt) => Promise<AuthResult>;
  audienceSignUp: (input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  joinSession: (input: {
    name: string;
    code: string;
    teamId?: number | null;
  }) => Promise<JoinSessionResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function rolesOf(record: { role?: string; roles?: string[] } | null) {
  if (!record) return [];
  if (Array.isArray(record.roles) && record.roles.length > 0) {
    return record.roles.filter((role) => role === 'teacher' || role === 'student' || role === 'admin');
  }
  if (record.role === 'teacher' || record.role === 'student' || record.role === 'admin') {
    return [record.role];
  }
  return [];
}

function canTeach(roles: string[]) {
  return roles.includes('teacher') || roles.includes('admin');
}

function displayNameOf(user: User, record: Record<string, unknown> | null) {
  const fromRecord = String(record?.displayName || '').trim();
  if (fromRecord) return fromRecord;
  const first = String(record?.firstName || '').trim();
  const last = String(record?.lastName || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  return user.displayName || user.email?.split('@')[0] || 'Host';
}

function profileFromBackend(
  firebaseUser: User,
  backend: {
    uid?: string;
    email?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    roles?: string[];
  },
  portal: Portal
): AppProfile {
  const roles = rolesOf(backend);
  const name =
    String(backend.displayName || '').trim() ||
    `${backend.firstName || ''} ${backend.lastName || ''}`.trim() ||
    firebaseUser.displayName ||
    firebaseUser.email?.split('@')[0] ||
    (portal === 'teacher' ? 'Host' : 'Audience');
  return {
    uid: backend.uid || firebaseUser.uid,
    email: backend.email || firebaseUser.email || '',
    name,
    role: portal === 'teacher' ? 'teacher' : 'student',
    roles: roles.length ? roles : [portal === 'teacher' ? 'teacher' : 'student'],
  };
}

async function readPortal(uid: string): Promise<Portal | null> {
  try {
    const raw = await AsyncStorage.getItem(PORTAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; portal?: string };
    if (parsed.uid && parsed.uid !== uid) return null;
    if (parsed.portal === 'teacher' || parsed.portal === 'student') return parsed.portal;
  } catch {
    return null;
  }
  return null;
}

async function writePortal(uid: string, portal: Portal) {
  await AsyncStorage.setItem(PORTAL_KEY, JSON.stringify({ uid, portal }));
  await AsyncStorage.setItem(
    ROLE_KEY,
    JSON.stringify({ uid, role: portal === 'teacher' ? 'teacher' : 'student' })
  );
}

async function clearAudienceSession() {
  await AsyncStorage.multiRemove([
    AUDIENCE_KEY,
    SESSION_CODE_KEY,
    STUDENT_NAME_KEY,
    JOIN_ACTIVITY_KEY,
  ]);
}

async function persistAudienceSession(profile: AppProfile) {
  await AsyncStorage.setItem(AUDIENCE_KEY, JSON.stringify(profile));
  await AsyncStorage.setItem(STUDENT_NAME_KEY, profile.name);
}

function authErrorMessage(error: unknown, fallback = 'Login failed') {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const rawMessage = error instanceof Error ? error.message : '';
  if (
    code === 'auth/google-unavailable' ||
    /Cannot find native module|ExpoCrypto|expo-auth-session/i.test(rawMessage)
  ) {
    console.log('[Google Auth]', error);
    return GOOGLE_UNAVAILABLE_MESSAGE;
  }
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/user-disabled':
      return 'Account has been disabled';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    case 'auth/email-already-in-use':
      return 'Email already registered';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters';
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by the browser';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled';
    default:
      return error instanceof Error ? error.message : fallback;
  }
}

async function createAccountOrSignIn(email: string, password: string, displayName: string) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return result.user;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (code === 'auth/email-already-in-use') {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    }
    throw error;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [loading, setLoading] = useState(true);
  const authEpoch = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const epoch = ++authEpoch.current;
      try {
        await hydrateGuestSessionFromStorage();
        if (epoch !== authEpoch.current) return;
        if (!nextUser) {
          const raw = await AsyncStorage.getItem(AUDIENCE_KEY);
          if (raw) {
            const guest = JSON.parse(raw) as AppProfile;
            if (guest?.guest && guest.role === 'student') {
              markGuestSessionActive();
              if (epoch !== authEpoch.current) return;
              setUser(null);
              setProfile(guest);
              setPortal('student');
              return;
            }
          }
          // A guest join may have just set profile while this callback was in
          // flight. Do not wipe it — that bounced Live Chat back to `/`.
          if (isGuestSessionSync() || epoch !== authEpoch.current) return;
          setUser(null);
          setProfile(null);
          setPortal(null);
          return;
        }

        clearGuestSession();
        const snap = await get(ref(db, `users/${nextUser.uid}`));
        const record = snap.exists() ? (snap.val() as Record<string, unknown>) : null;
        const roles = rolesOf(record as { role?: string; roles?: string[] } | null);
        const storedPortal = await readPortal(nextUser.uid);
        let nextPortal = storedPortal;
        if (!nextPortal) {
          if (canTeach(roles) && !roles.includes('student')) nextPortal = 'teacher';
          else if (roles.includes('student') && !canTeach(roles)) nextPortal = 'student';
        }

        const role: AppProfile['role'] = nextPortal === 'teacher' ? 'teacher' : 'student';
        if (epoch !== authEpoch.current) return;
        setUser(nextUser);
        setPortal(nextPortal);
        setProfile({
          uid: nextUser.uid,
          email: nextUser.email || String(record?.email || ''),
          name: displayNameOf(nextUser, record),
          role,
          roles: roles.length ? roles : [role],
        });
      } catch {
        if (epoch !== authEpoch.current) return;
        setUser(nextUser);
        setProfile(null);
        setPortal(null);
      } finally {
        if (epoch === authEpoch.current) setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signInHost = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const backend = await syncProfileFromBackend(result.user, 'teacher', undefined, undefined, {
        mergeRole: false,
      });
      if (!canAccessTeacherPortal(backend)) {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: 'This account does not have host access. Sign up as a host or use the audience login.',
        };
      }
      await writePortal(result.user.uid, 'teacher');
      await clearAudienceSession();
      clearGuestSession();
      const profileNext = profileFromBackend(result.user, backend, 'teacher');
      setUser(result.user);
      setProfile(profileNext);
      setPortal('teacher');
      return { success: true };
    } catch (error) {
      if (auth.currentUser) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      return { success: false, error: authErrorMessage(error) };
    }
  };

  const signInHostWithGoogle = async (promptAsync: GooglePrompt): Promise<AuthResult> => {
    try {
      let signInWithGoogleNative: typeof import('@/lib/googleAuth').signInWithGoogleNative;
      try {
        signInWithGoogleNative = require('@/lib/googleAuth').signInWithGoogleNative;
      } catch (loadError) {
        console.log('[Google Auth] failed to load googleAuth', loadError);
        return { success: false, error: GOOGLE_UNAVAILABLE_MESSAGE };
      }
      const result = await signInWithGoogleNative(promptAsync);
      const backend = await syncProfileFromBackend(result.user, 'teacher', undefined, undefined, {
        mergeRole: true,
      });
      if (!canAccessTeacherPortal(backend)) {
        await firebaseSignOut(auth).catch(() => undefined);
        return { success: false, error: 'This Google account does not have host access.' };
      }
      await writePortal(result.user.uid, 'teacher');
      await clearAudienceSession();
      clearGuestSession();
      const profileNext = profileFromBackend(result.user, backend, 'teacher');
      setUser(result.user);
      setProfile(profileNext);
      setPortal('teacher');
      return { success: true };
    } catch (error) {
      if (auth.currentUser) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      return { success: false, error: authErrorMessage(error, 'Google sign-in failed') };
    }
  };

  const hostSignUp = async ({
    firstName,
    lastName,
    email,
    password,
  }: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<AuthResult> => {
    try {
      const firebaseUser = await createAccountOrSignIn(
        email.trim(),
        password,
        `${firstName} ${lastName}`.trim()
      );
      const backend = await syncProfileFromBackend(
        firebaseUser,
        'teacher',
        firstName,
        lastName,
        { mergeRole: true }
      );
      if (!canAccessTeacherPortal(backend)) {
        return { success: false, error: 'Could not enable host access for this account.' };
      }
      await writePortal(firebaseUser.uid, 'teacher');
      await clearAudienceSession();
      clearGuestSession();
      const profileNext = profileFromBackend(firebaseUser, backend, 'teacher');
      setUser(firebaseUser);
      setProfile(profileNext);
      setPortal('teacher');
      return { success: true };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Signup failed') };
    }
  };

  const audienceSignIn = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      const backend = await syncProfileFromBackend(result.user, 'student', undefined, undefined, {
        mergeRole: true,
      });
      if (!canAccessStudentPortal(backend)) {
        await firebaseSignOut(auth);
        return {
          success: false,
          error: 'This account does not have audience access. Sign up as an audience member first.',
        };
      }
      const profileNext = profileFromBackend(result.user, backend, 'student');
      await writePortal(result.user.uid, 'student');
      await persistAudienceSession(profileNext);
      clearGuestSession();
      setUser(result.user);
      setProfile(profileNext);
      setPortal('student');
      return { success: true };
    } catch (error) {
      if (auth.currentUser) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      return { success: false, error: authErrorMessage(error) };
    }
  };

  const audienceSignInWithGoogle = async (promptAsync: GooglePrompt): Promise<AuthResult> => {
    try {
      let signInWithGoogleNative: typeof import('@/lib/googleAuth').signInWithGoogleNative;
      try {
        signInWithGoogleNative = require('@/lib/googleAuth').signInWithGoogleNative;
      } catch (loadError) {
        console.log('[Google Auth] failed to load googleAuth', loadError);
        return { success: false, error: GOOGLE_UNAVAILABLE_MESSAGE };
      }
      const result = await signInWithGoogleNative(promptAsync);
      const backend = await syncProfileFromBackend(result.user, 'student', undefined, undefined, {
        mergeRole: true,
      });
      if (!canAccessStudentPortal(backend)) {
        await firebaseSignOut(auth).catch(() => undefined);
        return { success: false, error: 'This Google account does not have audience access.' };
      }
      const profileNext = profileFromBackend(result.user, backend, 'student');
      await writePortal(result.user.uid, 'student');
      await persistAudienceSession(profileNext);
      clearGuestSession();
      setUser(result.user);
      setProfile(profileNext);
      setPortal('student');
      return { success: true };
    } catch (error) {
      if (auth.currentUser) {
        await firebaseSignOut(auth).catch(() => undefined);
      }
      return { success: false, error: authErrorMessage(error, 'Google sign-in failed') };
    }
  };

  const audienceSignUp = async ({
    firstName,
    lastName,
    email,
    password,
  }: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<AuthResult> => {
    try {
      const firebaseUser = await createAccountOrSignIn(
        email.trim(),
        password,
        `${firstName} ${lastName}`.trim()
      );
      const backend = await syncProfileFromBackend(
        firebaseUser,
        'student',
        firstName,
        lastName,
        { mergeRole: true }
      );
      if (!canAccessStudentPortal(backend)) {
        return { success: false, error: 'Could not enable audience access for this account.' };
      }
      const profileNext = profileFromBackend(firebaseUser, backend, 'student');
      await writePortal(firebaseUser.uid, 'student');
      await persistAudienceSession(profileNext);
      clearGuestSession();
      setUser(firebaseUser);
      setProfile(profileNext);
      setPortal('student');
      return { success: true };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Signup failed') };
    }
  };

  const resetPassword = async (email: string): Promise<AuthResult> => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return { success: true };
    } catch (error) {
      return { success: false, error: authErrorMessage(error, 'Failed to send reset email') };
    }
  };

  const joinSession = async ({
    name,
    code,
    teamId = null,
  }: {
    name: string;
    code: string;
    teamId?: number | null;
  }): Promise<JoinSessionResult> => {
    const trimmedName = name.trim() || profile?.name?.trim() || 'Audience';
    const trimmedCode = String(code || '')
      .trim()
      .toUpperCase();
    if (trimmedCode.length !== 6) {
      return { success: false, error: 'Session code must be exactly 6 characters' };
    }

    const finishLocalAudience = async (activityType: string) => {
      authEpoch.current += 1;
      if (user) {
        const student: AppProfile = {
          uid: user.uid,
          email: user.email || profile?.email || '',
          name: trimmedName || profile?.name || 'Audience',
          role: 'student',
          roles: profile?.roles?.includes('student')
            ? profile.roles
            : ['student', ...(profile?.roles || [])],
        };
        await writePortal(user.uid, 'student');
        await AsyncStorage.setItem(AUDIENCE_KEY, JSON.stringify(student));
        await AsyncStorage.setItem(STUDENT_NAME_KEY, student.name);
        await AsyncStorage.setItem(SESSION_CODE_KEY, trimmedCode);
        await AsyncStorage.setItem(JOIN_ACTIVITY_KEY, activityType);
        setProfile(student);
        setPortal('student');
        return;
      }

      const guest: AppProfile = {
        uid: '',
        email: '',
        name: trimmedName,
        role: 'student',
        roles: ['student'],
        guest: true,
      };
      markGuestSessionActive();
      await AsyncStorage.setItem(AUDIENCE_KEY, JSON.stringify(guest));
      await AsyncStorage.setItem(STUDENT_NAME_KEY, trimmedName);
      await AsyncStorage.setItem(SESSION_CODE_KEY, trimmedCode);
      await AsyncStorage.setItem(JOIN_ACTIVITY_KEY, activityType);
      await AsyncStorage.setItem(PORTAL_KEY, JSON.stringify({ uid: '', portal: 'student' }));
      setUser(null);
      setProfile(guest);
      setPortal('student');
    };

    // Guests omit studentUid/studentEmail; logged-in accounts include them (Web).
    // A host who joins by code is treated as an audience member for this session.
    const studentUid =
      user?.uid || (profile?.guest ? undefined : profile?.uid) || undefined;
    const studentEmail = user?.email || profile?.email || undefined;

    const joinResult = await executeSessionJoin({
      name: trimmedName,
      code: trimmedCode,
      teamId,
      studentUid,
      studentEmail,
      loggedInStudent: Boolean(user?.uid && !profile?.guest && !canTeach(profile?.roles || [])),
    });

    if (joinResult.needsTeamSelection) {
      await clearJoinInProgress();
      return joinResult;
    }

    if (!joinResult.success || !joinResult.activityType) {
      await clearJoinInProgress();
      return joinResult;
    }

    await markJoinInProgress();
    const pendingHref = await stashPendingJoinHref(joinResult);
    await finishLocalAudience(String(joinResult.activityType));
    // TEMP DEBUG — remove after guest join is confirmed
    console.log('[TEMP DEBUG] joinSession stored', {
      code: trimmedCode,
      activityType: joinResult.activityType,
      pendingHref,
      guest: !user,
      userUid: user?.uid || null,
    });
    return joinResult;
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove([
      ROLE_KEY,
      PORTAL_KEY,
      AUDIENCE_KEY,
      SESSION_CODE_KEY,
      STUDENT_NAME_KEY,
      JOIN_ACTIVITY_KEY,
      PENDING_JOIN_HREF_KEY,
      JOIN_IN_PROGRESS_KEY,
    ]);
    clearGuestSession();
    clearLastAppliedJoinHref();
    await clearJoinInProgress();
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    setProfile(null);
    setPortal(null);
  };

  const isHost = Boolean(profile && portal === 'teacher' && canTeach(profile.roles));
  const isStudent = Boolean(profile && portal === 'student' && !isHost);

  const value = useMemo(
    () => ({
      user,
      profile,
      portal,
      loading,
      isHost,
      isStudent,
      signInHost,
      signInHostWithGoogle,
      hostSignUp,
      audienceSignIn,
      audienceSignInWithGoogle,
      audienceSignUp,
      resetPassword,
      joinSession,
      signOut,
    }),
    [user, profile, portal, loading, isHost, isStudent]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
