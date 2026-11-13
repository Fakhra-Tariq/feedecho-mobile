import { Redirect, Stack, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HostProfileButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { HostSessionProvider } from '@/context/HostSessionContext';
import { setHostPathname } from '@/lib/activeActivity';

/**
 * Host shell: tab navigator in `(tabs)`, Live Chat as a stack screen so
 * Explore can `router.push('/host/live-chat')`. Expo Router SDK 58
 * `href: null` on a tab unregisters the route (`hidden: true`), which made
 * that push a no-op.
 */
export default function HostLayout() {
  const { loading, isHost } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const androidHeaderStatusBarHeight =
    Platform.OS === 'android' ? Math.max(insets.top, StatusBar.currentHeight ?? 0) : undefined;
  useEffect(() => {
    setHostPathname(pathname);
  }, [pathname]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!isHost) {
    return <Redirect href={'/' as Href} />;
  }

  return (
    <HostSessionProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.white },
          headerTintColor: COLORS.header,
          headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="live-chat"
          options={{
            title: 'Anonymous Chat',
            headerRight: () => <HostProfileButton />,
            headerTitleStyle: {
              fontSize: 20,
              fontWeight: FONT_WEIGHTS.medium,
              color: COLORS.ink,
            },
            ...(androidHeaderStatusBarHeight != null
              ? { headerStatusBarHeight: androidHeaderStatusBarHeight }
              : {}),
          }}
        />
      </Stack>
    </HostSessionProvider>
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
