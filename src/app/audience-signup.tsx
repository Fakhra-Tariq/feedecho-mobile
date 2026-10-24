import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthDivider, GoogleSignInButton } from '@/components/AuthExtras';
import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { EntryGate } from '@/components/RoleRedirect';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useGoogleIdTokenRequest } from '@/lib/googleAuth';

export default function AudienceSignUpScreen() {
  const { audienceSignUp, audienceSignInWithGoogle } = useAuth();
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async () => {
    if (isSubmitting) return;
    setError('');
    setSuccessMessage('');

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');

    setIsSubmitting(true);
    const result = await audienceSignUp({
      firstName,
      lastName,
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (result.success) {
      setSuccessMessage('Account created successfully! Redirecting...');
      setTimeout(() => router.replace('/audience' as Href), 800);
      return;
    }
    setError(result.error || 'Failed to create account. Please try again.');
  };

  const onGoogle = async () => {
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    setGoogleLoading(true);
    const result = await audienceSignInWithGoogle(promptAsync);
    setGoogleLoading(false);
    setIsSubmitting(false);
    if (result.success) {
      router.replace('/audience' as Href);
      return;
    }
    setError(result.error || 'Google sign-in failed. Please try again.');
  };

  return (
    <EntryGate screen="join">
      <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
          <AppCard style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="person-add-outline" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Audience Sign Up</Text>
            <Text style={styles.subtitle}>Create your audience account.</Text>

            {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              autoCorrect={false}
              style={styles.input}
            />

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

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
            />

            <AppButton
              label={isSubmitting && !googleLoading ? 'Creating account...' : 'Create Account'}
              loading={isSubmitting && !googleLoading}
              onPress={onSubmit}
              disabled={isSubmitting}
            />

            <AuthDivider label="OR" />

            <GoogleSignInButton
              onPress={onGoogle}
              loading={googleLoading}
              disabled={isSubmitting}
            />

            <Pressable
              accessibilityRole="link"
              onPress={() => router.replace('/join' as Href)}
              style={styles.linkRow}>
              <Text style={styles.mutedLink}>
                Already have an account? <Text style={styles.linkText}>Sign In</Text>
              </Text>
            </Pressable>
          </AppCard>
      </KeyboardSafeScreen>
    </EntryGate>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: SPACING[6] },
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
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[4],
  },
  mutedLink: {
    color: COLORS.darkTextSecondary,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 14,
  },
});
