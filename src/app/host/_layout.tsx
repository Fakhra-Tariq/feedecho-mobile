import { Redirect, Stack, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { HostSessionProvider } from '@/context/HostSessionContext';
import { setHostPathname } from '@/lib/activeActivity';

/**
 * Host shell: tab navigator in `(tabs)`. Live Chat is a tab (`/host/live-chat`)
 * so Explore's card and the Chat tab open the same screen.
 */
export default function HostLayout() {
  const { loading, isHost, user, profile } = useAuth();
  const hostUid = String(user?.uid || profile?.uid || '').trim();
  const pathname = usePathname();
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
    <HostSessionProvider key={hostUid || 'host'}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.white },
          headerTintColor: COLORS.header,
          headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: COLORS.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
