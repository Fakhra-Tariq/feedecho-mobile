import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppAlertProvider } from '@/components/AppAlert';
import { COLORS, FONT_WEIGHTS, NAV_THEME } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/AuthContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppAlertProvider>
          <ThemeProvider value={NAV_THEME}>
            <StatusBar style="dark" />
            <RootNavigator />
          </ThemeProvider>
        </AppAlertProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: {
          color: COLORS.header,
          fontWeight: FONT_WEIGHTS.semibold,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="about" options={{ headerShown: false }} />
      <Stack.Screen name="contact" options={{ headerShown: false }} />
      <Stack.Screen name="host-login" options={{ headerShown: false }} />
      <Stack.Screen name="host-signup" options={{ headerShown: false }} />
      <Stack.Screen name="host-forgot" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={{ headerShown: false }} />
      <Stack.Screen name="audience-signup" options={{ headerShown: false }} />
      <Stack.Screen name="audience-forgot" options={{ headerShown: false }} />
      <Stack.Screen name="host" options={{ headerShown: false }} />
      <Stack.Screen name="audience" options={{ headerShown: false }} />
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
