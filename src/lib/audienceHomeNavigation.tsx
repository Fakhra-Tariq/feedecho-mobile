import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useFocusEffect } from "expo-router/react-navigation";
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, Pressable } from 'react-native';

import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  clearStayOnPublicHome,
  clearStoredActivityEntrySource,
  markStayOnPublicHome,
  parseActivityEntrySource,
  readStoredActivityEntrySource,
  type ActivityEntrySource,
} from '@/lib/activityEntrySource';

export type { ActivityEntrySource } from '@/lib/activityEntrySource';
export {
  ACTIVITY_SOURCE_PARAM,
  appendActivityEntrySource,
  parseActivityEntrySource,
  readStoredActivityEntrySource,
  stashActivityEntrySource,
} from '@/lib/activityEntrySource';

const PUBLIC_HOME = '/' as Href;
const STUDENT_HOME = '/audience' as Href;

function resetToPublicHome(navigation: { getParent?: () => unknown; dispatch: (a: unknown) => void }) {
  markStayOnPublicHome();
  try {
    let nav: { getParent?: () => unknown; dispatch: (a: unknown) => void } = navigation;
    while (typeof nav.getParent === 'function') {
      const parent = nav.getParent() as typeof nav | undefined;
      if (!parent) break;
      nav = parent;
    }
    nav.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'index' }],
      })
    );
    return;
  } catch {
    // Fall through to replace.
  }
  try {
    if (typeof router.dismissAll === 'function') router.dismissAll();
  } catch {
    // Older stacks may not support dismissAll.
  }
  router.replace(PUBLIC_HOME);
}

/**
 * Leave an audience activity.
 * `source === 'public'` → public home with a clean back stack.
 * `source === 'student'` → student dashboard Home (today's behavior).
 * Missing source → today's guest vs logged-in fallback + console.warn.
 */
export async function leaveActivity(
  source: ActivityEntrySource | null | undefined,
  options: {
    navigation?: { getParent?: () => unknown; dispatch: (a: unknown) => void };
    signOut?: () => Promise<void>;
    isGuest?: boolean;
  } = {}
) {
  const resolved = parseActivityEntrySource(source);
  await clearStoredActivityEntrySource();

  if (!resolved) {
    console.warn(
      '[leaveActivity] missing or unknown entry source; falling back to previous guest/student home'
    );
    if (options.isGuest) {
      await options.signOut?.();
      if (options.navigation) resetToPublicHome(options.navigation);
      else router.replace(PUBLIC_HOME);
      return;
    }
    clearStayOnPublicHome();
    router.replace(STUDENT_HOME);
    return;
  }

  if (resolved === 'public') {
    if (options.isGuest) {
      await options.signOut?.();
    } else {
      markStayOnPublicHome();
    }
    if (options.navigation) {
      resetToPublicHome(options.navigation);
      return;
    }
    markStayOnPublicHome();
    router.replace(PUBLIC_HOME);
    return;
  }

  clearStayOnPublicHome();
  router.replace(STUDENT_HOME);
}

/** @deprecated Use leaveActivity / useLeaveActivity. */
export async function navigateAudienceActivityHome(input: {
  isGuest: boolean;
  signOut: () => Promise<void>;
}) {
  await leaveActivity(null, { isGuest: input.isGuest, signOut: input.signOut });
}

type LeaveHookOptions = {
  /** When false, do not inject a header back button (custom headers). Default true. */
  headerBack?: boolean;
};

export function useLeaveActivity(options: LeaveHookOptions = {}) {
  const headerBack = options.headerBack !== false;
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ entrySource?: string }>();
  const { profile, signOut } = useAuth();
  const isGuest = Boolean(profile?.guest);
  const [stored, setStored] = useState<ActivityEntrySource | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    readStoredActivityEntrySource().then((value) => {
      if (!cancelled) setStored(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const source = parseActivityEntrySource(params.entrySource) || stored;

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    void leaveActivity(source, {
      navigation,
      signOut,
      isGuest,
    }).finally(() => {
      leavingRef.current = false;
    });
  }, [source, navigation, signOut, isGuest]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leave();
        return true;
      });
      return () => sub.remove();
    }, [leave])
  );

  useLayoutEffect(() => {
    if (!headerBack) return;
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.header} />
        </Pressable>
      ),
    });
  }, [headerBack, leave, navigation]);

  return { source, leave };
}
