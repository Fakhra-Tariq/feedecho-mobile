import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { LogoutButton } from '@/components/LogoutButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { resolvePendingJoinHref } from '@/lib/joinSessionNavigation';
import { useSafeTabBarStyle } from '@/lib/tabBarSafeArea';

/**
 * If a join completed but we landed on the audience shell (dashboard index)
 * before the activity replace applied, finish the redirect here.
 * No-op when there is no pending join (fresh student open).
 */
function usePendingJoinSafetyNet(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const href = await resolvePendingJoinHref({ retries: 1, delayMs: 30 });
      if (cancelled || !href) return;
      router.replace(href as Href);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

/**
 * Mobile adaptation of Web AudienceDashboardNavbar:
 * Web top nav = Home + Progress (+ AI toggle + Profile menu).
 * Tabs: Home | Progress | Study | Profile. Activity screens stay hidden.
 */
export default function AudienceLayout() {
  const { loading, isStudent, isHost, profile } = useAuth();
  const isGuest = Boolean(profile?.guest);
  const tabBarStyle = useSafeTabBarStyle();
  usePendingJoinSafetyNet(Boolean(isStudent && !isHost && !loading));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isHost) {
    return <Redirect href={'/host' as Href} />;
  }

  if (!isStudent) {
    return <Redirect href={'/' as Href} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
        headerShadowVisible: false,
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.iconMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
        tabBarStyle,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: COLORS.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="study-assistant"
        options={{
          title: 'Study',
          tabBarLabel: 'Study',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="join" options={{ href: null, title: 'Join a Session' }} />
      <Tabs.Screen
        name="quiz"
        options={{
          href: null,
          title: 'Quiz',
          ...(isGuest
            ? {
                headerRight: () => null,
                tabBarStyle: { display: 'none' as const },
              }
            : {}),
        }}
      />
      <Tabs.Screen name="quiz-history" options={{ href: null, title: 'My Quizzes' }} />
      <Tabs.Screen
        name="space-race-history"
        options={{ href: null, title: 'Space Race History' }}
      />
      <Tabs.Screen
        name="live-chat"
        options={{
          href: null,
          title: 'Live Chat',
          sceneStyle: { backgroundColor: COLORS.cream },
        }}
      />
      <Tabs.Screen
        name="exit-ticket"
        options={{
          href: null,
          title: 'Exit Ticket',
          ...(isGuest
            ? {
                headerRight: () => null,
                tabBarStyle: { display: 'none' as const },
              }
            : {}),
        }}
      />
      <Tabs.Screen
        name="space-race"
        options={{
          href: null,
          title: 'Space Race',
          headerShown: false,
          headerRight: () => null,
          tabBarStyle: { display: 'none' as const },
        }}
      />
      <Tabs.Screen
        name="space-race-quiz"
        options={{
          href: null,
          title: 'Race Quiz',
          headerShown: false,
          headerRight: () => null,
          tabBarStyle: { display: 'none' as const },
        }}
      />
    </Tabs>
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
