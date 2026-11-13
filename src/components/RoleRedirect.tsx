import { Redirect, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { shouldStayOnPublicHome } from '@/lib/activityEntrySource';
import { isCodeJoinGuest } from '@/lib/guestSession';
import {
  clearLastAppliedJoinHref,
  getLastAppliedJoinHref,
  hrefToRouterTarget,
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
  const { loading, isHost, isStudent, profile, user, portal } = useAuth();
  const isGuest = isCodeJoinGuest({
    profileGuest: profile?.guest,
    isHost,
    firebaseUid: user?.uid,
  });
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
        // Keep lastAppliedJoinHref so a failed nested replace can still recover.
        setJoinGate({ activity: href });
      } else {
        setJoinGate('audience');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [screen, isStudent, isGuest, loading]);

  if (loading) return 'loading' as const;
  // Public /join is a participant entry (Web guest join). Never send a logged-in
  // host to the host dashboard from this screen — a code join always opens the activity.
  if (isHost && screen !== 'join') {
    console.log('[TEMP DEBUG] EntryGate redirect', { screen, from: screen, to: '/host', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
    return '/host' as Href;
  }

  // Logged-in student on host-login → audience dashboard (unchanged).
  if (screen === 'host-login' && isStudent && !isGuest) {
    console.log('[TEMP DEBUG] EntryGate redirect', { screen, from: 'host-login', to: '/audience', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
    return '/audience' as Href;
  }

  // Fresh logged-in student opening the landing page → audience.
  // Guests (code join, no login) must never be sent to Home/Progress/Study/Profile.
  if (screen === 'landing' && isStudent) {
    if (shouldStayOnPublicHome() || isGuest) return null;
    console.log('[TEMP DEBUG] EntryGate redirect', { screen, from: 'landing', to: '/audience', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
    return '/audience' as Href;
  }

  // After isStudent flips on /join: wait, then activity. Never /audience for guests.
  if (screen === 'join' && isStudent) {
    if (joinGate === 'idle' || joinGate === 'checking') return 'loading' as const;
    if (typeof joinGate === 'object' && joinGate.activity) {
      console.log('[TEMP DEBUG] EntryGate redirect', {
        screen,
        from: '/join',
        to: joinGate.activity,
        user: user?.uid || null,
        role: profile?.role,
        portal,
        loading,
        isGuest,
      });
      return hrefToRouterTarget(joinGate.activity);
    }
    // Guests are not logged-in students. A code join must open the activity,
    // never Home/Progress/Study/Profile. Do not send guests to /audience.
    if (isGuest) {
      console.log('[TEMP DEBUG] EntryGate skip dashboard for guest', { user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
      return null;
    }
    console.log('[TEMP DEBUG] EntryGate redirect', { screen, from: '/join', to: '/audience', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
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
