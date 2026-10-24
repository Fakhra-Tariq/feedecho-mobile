import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

/** Shared logout control — clears session and returns to the landing screen. */
export function LogoutButton({ label = 'Logout' }: { label?: string }) {
  const { signOut } = useAuth();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={async () => {
        await signOut();
        router.replace('/' as Href);
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={8}>
      <Ionicons name="log-out-outline" size={16} color={COLORS.primary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: SPACING[4],
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pressed: { opacity: 0.7 },
  label: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 14,
  },
});
