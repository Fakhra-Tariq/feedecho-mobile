import { Redirect, Stack, router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StudentAccountButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { isAudienceActivityPath, isCodeJoinGuest, isGuestSessionSync } from '@/lib/guestSession';
import {
  getLastAppliedJoinHref,
  hrefToRouterTarget,
  resolvePendingJoinHref,
} from '@/lib/joinSessionNavigation';

/**
 * Audience shell: tab Home/Progress/Study/Profile in `(tabs)`, activities as
 * stack screens. Expo Router SDK 58 `href: null` on a tab unregisters the
 * route, so join → `/audience/live-chat` (and quiz / race / ticket) was a
 * no-op that dumped guests on the dashboard.
 */
function usePendingJoinSafetyNet(enabled: boolean, isGuest: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      // One-shot pending href only. lastAppliedJoinHref is guest recovery —
      // using it for logged-in students re-opens Live Chat after they leave Home.
      const href =
        (await resolvePendingJoinHref({ retries: 1, delayMs: 30 })) ||
        (isGuest ? getLastAppliedJoinHref() : null);
      if (cancelled || !href) return;
      const pathOnly = href.split('?')[0];
      if (pathname && pathOnly && pathname.startsWith(pathOnly)) return;
      // TEMP DEBUG — remove after student leave-from-chat is confirmed
      console.log('[TEMP DEBUG] audience layout safety-net replace', {
        from: pathname,
        to: href,
        isGuest,
        guestSession: isGuestSessionSync(),
      });
      router.replace(hrefToRouterTarget(href));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname, isGuest]);
}

export default function AudienceLayout() {
  const { loading, isStudent, isHost, profile, user, portal } = useAuth();
  const pathname = usePathname();
  const isGuest = isCodeJoinGuest({
    profileGuest: profile?.guest,
    isHost,
    firebaseUid: user?.uid,
  });
  const onActivity = isAudienceActivityPath(pathname);
  const insets = useSafeAreaInsets();
  const androidHeaderStatusBarHeight =
    Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight ?? 0) : undefined;
  usePendingJoinSafetyNet(
    Boolean((isStudent || isGuest || onActivity) && !isHost && !loading),
    isGuest
  );

  if (loading && !onActivity) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isHost && !onActivity) {
    console.log('[TEMP DEBUG] audience layout redirect', { from: pathname, to: '/host', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
    return <Redirect href={'/host' as Href} />;
  }

  // Guests must stay on Live Chat / Quiz / Race / Ticket even if auth briefly
  // reports portal=null (onAuthStateChanged racing the join). Never bounce `/`.
  if (!onActivity && !isStudent && !isGuest) {
    console.log('[TEMP DEBUG] audience layout redirect', { from: pathname, to: '/', user: user?.uid || null, role: profile?.role, portal, loading, isGuest });
    return <Redirect href={'/' as Href} />;
  }

  const activityHeader = {
    headerStyle: { backgroundColor: COLORS.white },
    headerTintColor: COLORS.header,
    headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
    headerShadowVisible: false,
    headerRight: isGuest ? () => null : () => <StudentAccountButton />,
    ...(androidHeaderStatusBarHeight != null
      ? { headerStatusBarHeight: androidHeaderStatusBarHeight }
      : {}),
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={{ title: 'Join a Session', ...activityHeader }} />
      <Stack.Screen name="quiz" options={{ title: 'Quiz', ...activityHeader }} />
      <Stack.Screen name="quiz-history" options={{ title: 'My Quizzes', ...activityHeader }} />
      <Stack.Screen
        name="space-race-history"
        options={{ title: 'Space Race History', ...activityHeader }}
      />
      <Stack.Screen
        name="live-chat"
        options={{
          title: 'Live Chat',
          ...activityHeader,
          contentStyle: { backgroundColor: COLORS.cream },
        }}
      />
      <Stack.Screen name="exit-ticket" options={{ title: 'Exit Ticket', ...activityHeader }} />
      <Stack.Screen
        name="space-race"
        options={{ title: 'Space Race', headerShown: false, headerRight: () => null }}
      />
      <Stack.Screen
        name="space-race-quiz"
        options={{ title: 'Race Quiz', headerShown: false, headerRight: () => null }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
