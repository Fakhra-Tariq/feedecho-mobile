import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';

export function AuthDivider({ label }: { label: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.line} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

export function GoogleSignInButton({
  onPress,
  loading,
  disabled,
}: {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.googleBtn,
        (disabled || loading) && styles.disabled,
        pressed && !(disabled || loading) && styles.pressed,
      ]}>
      {loading ? (
        <>
          <ActivityIndicator color={COLORS.mutedText} />
          <Text style={styles.googleLabel}>Connecting...</Text>
        </>
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color="#EA4335" />
          <Text style={styles.googleLabel}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    marginVertical: SPACING[5],
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLORS.divider },
  dividerLabel: {
    color: COLORS.darkTextSecondary,
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 1,
  },
  googleBtn: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
  },
  googleLabel: {
    color: COLORS.text,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 15,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.88, backgroundColor: COLORS.surfaceMuted },
});
