import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';

let dismissedThisSession = false;

/** Guest-only prompt matching Web GuestProgressLoginBanner. */
export function GuestProgressLoginBanner({ visible }: { visible: boolean }) {
  const [dismissed, setDismissed] = useState(dismissedThisSession);

  if (!visible || dismissed) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.copy}>
        Log in to save this to your progress history.{' '}
        <Text
          style={styles.link}
          onPress={() => router.push('/audience/join' as Href)}
          accessibilityRole="link">
          Log in
        </Text>
      </Text>
      <Pressable
        onPress={() => {
          dismissedThisSession = true;
          setDismissed(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
        style={styles.dismiss}>
        <Ionicons name="close" size={16} color={COLORS.inkSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.blush,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  copy: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.text,
  },
  link: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  dismiss: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
