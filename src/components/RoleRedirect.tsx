import { Redirect, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { shouldStayOnPublicHome } from '@/lib/activityEntrySource';
import {
  clearLastAppliedJoinHref,
  getLastAppliedJoinHref,
  resolvePendingJoinHref,
} from '@/lib/joinSessionNavigation';

type EntryScreen = 'landing' | 'join' | 'host-login';

/**
 * Join-screen gate state — never infer "no pending join" from a null href
 * alone while a join may still be resolving.
 *
 * - idle: guest form visible (or non-join screen)
 * - checking: isStudent on /join; awaiting pending activity href
 * - activity: redirect to the launched activity
 * - audience: no pending join → student dashboard (fresh open)
 */
type JoinGate = 'idle' | 'checking' | { activity: string } | 'audience';

/**
 * Same destinations as Web's RedirectIfHostTeacher:
 * host -> /host, student -> /audience.
 * After guest join on /join, wait for pending activity href before deciding.
 *
 * BEFORE (broken): pendingJoinHref was set to `null` while still a guest, so when
 * isStudent flipped the code treated null as "no pending join" and redirected to
 * /audience immediately (skipped AsyncStorage wait).
 *
 * AFTER: on /join + isStudent always enter `checking`, await resolvePendingJoinHref
 * (and honor lastAppliedJoinHref if navigate already ran), then redirect.
 */
export function useEntryRedirect(screen: EntryScreen) {
  const { loading, isHost, isStudent } = useAuth();
  const [joinGate, setJoinGate] = useState<JoinGate>('idle');

  useEffect(() => {
    if (screen !== 'join') {
      setJoinGate('idle');
      return;
    }

    // Still a guest on the join form — show the form; reset for the next join.
    if (!isStudent) {
      clearLastAppliedJoinHref();
      setJoinGate('idle');
      return;
    }

    // Student on /join: ALWAYS check pending before /audience (null is ambiguous).
    let cancelled = false;
    setJoinGate('checking');

    (async () => {
      const href =
        (await resolvePendingJoinHref()) || getLastAppliedJoinHref();
      if (cancelled) return;
      if (href) {
        clearLastAppliedJoinHref();
        setJoinGate({ activity: href });
      } else {
        setJoinGate('audience');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, isStudent]);

  if (loading) return 'loading' as const;
  if (isHost) return '/host' as Href;

  // Logged-in student on host-login → audience dashboard (unchanged).
  if (screen === 'host-login' && isStudent) return '/audience' as Href;

  // Fresh student opening the landing page → audience.
  // After leaving a public-join activity, stay on landing even if still logged in.
  if (screen === 'landing' && isStudent) {
    if (shouldStayOnPublicHome()) return null;
    return '/audience' as Href;
  }

  // Guest join screen after isStudent flips: wait, then activity or /audience.
  if (screen === 'join' && isStudent) {
    if (joinGate === 'idle' || joinGate === 'checking') return 'loading' as const;
    if (typeof joinGate === 'object' && joinGate.activity) {
      return joinGate.activity as Href;
    }
    return '/audience' as Href;
  }

  return null;
}

export function EntryGate({
  screen,
  children,
}: {
  screen: EntryScreen;
  children: ReactNode;
}) {
  const target = useEntryRedirect(screen);
  if (target === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (target) return <Redirect href={target} />;
  return children;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
