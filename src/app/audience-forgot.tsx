import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { EntryGate } from '@/components/RoleRedirect';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export default function AudienceForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError('');
    setMessage('');
    const result = await resetPassword(email.trim());
    setLoading(false);
    if (result.success) {
      setMessage('Password reset email sent. Check your inbox.');
      return;
    }
    setError(result.error || 'Failed to send reset email.');
  };

  return (
    <EntryGate screen="join">
      <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
        <AppCard style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-open-outline" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we will send you a reset link.
          </Text>

          {message ? <Text style={styles.success}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            style={styles.input}
          />

          <AppButton
            label={loading ? 'Sending...' : 'Send Reset Link'}
            loading={loading}
            onPress={handleSubmit}
            disabled={loading}
          />

          <Pressable
            accessibilityRole="link"
            onPress={() => router.replace('/join' as Href)}
            style={styles.linkRow}>
            <Text style={styles.linkText}>Back to join</Text>
          </Pressable>
        </AppCard>
      </KeyboardSafeScreen>
    </EntryGate>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING[6],
  },
  card: { ...SHADOWS.raised },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  title: { ...TYPE.title },
  subtitle: { ...TYPE.subtitle, marginTop: SPACING[2], marginBottom: SPACING[5] },
  label: { ...TYPE.label, marginBottom: SPACING[2] },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[4],
    minHeight: 48,
    color: COLORS.text,
    marginBottom: SPACING[4],
    backgroundColor: COLORS.surfaceMuted,
  },
  error: { color: COLORS.dangerText, marginBottom: SPACING[3], fontSize: 14 },
  success: { color: COLORS.successText, marginBottom: SPACING[3], fontSize: 14 },
  linkRow: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: SPACING[4],
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 14,
  },
});
