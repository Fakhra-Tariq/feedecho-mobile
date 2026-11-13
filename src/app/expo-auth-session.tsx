import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

/** Matches the Google Sign-In return URL (`mobile:///expo-auth-session`). Does not navigate. */
export default function ExpoAuthSessionScreen() {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'none' }} />
      <View style={styles.screen} accessibilityLabel="Signing in">
        <Animated.View style={[styles.center, { opacity }]}>
          <AppCard style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="school-outline" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>FeedEcho</Text>
            <Text style={styles.subtitle}>Signing you in...</Text>
            <ActivityIndicator color={COLORS.primary} style={styles.spinner} />
          </AppCard>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING[6],
  },
  card: {
    ...SHADOWS.raised,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  title: { ...TYPE.title, textAlign: 'center' },
  subtitle: { ...TYPE.subtitle, marginTop: SPACING[2], textAlign: 'center' },
  spinner: { marginTop: SPACING[5] },
});
