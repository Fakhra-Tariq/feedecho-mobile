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

export default function HostLoginScreen() {
  const { signInHost, signInHostWithGoogle } = useAuth();
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async () => {
    if (submitting) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }
    setSubmitting(true);
    const result = await signInHost(email, password);
    setSubmitting(false);
    if (result.success) {
      router.replace('/host' as Href);
      return;
    }
    setError(result.error || 'Login failed. Please try again.');
  };

  const onGoogle = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    setGoogleLoading(true);
    const result = await signInHostWithGoogle(promptAsync);
    setGoogleLoading(false);
    setSubmitting(false);
    if (result.success) {
      router.replace('/host' as Href);
      return;
    }
    setError(result.error || 'Google sign-in failed. Please try again.');
  };

  return (
    <EntryGate screen="host-login">
      <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
          <AppCard style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="school-outline" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Host Login</Text>
            <Text style={styles.subtitle}>Sign in to run a live session.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="you@school.edu"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="Password"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              label={submitting && !googleLoading ? 'Signing in...' : 'Sign In'}
              icon="log-in-outline"
              loading={submitting && !googleLoading}
              onPress={onSubmit}
              disabled={submitting}
            />

            <AuthDivider label="OR" />

            <GoogleSignInButton
              onPress={onGoogle}
              loading={googleLoading}
              disabled={googleLoading || submitting}
            />

            <View style={styles.linksRow}>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/host-forgot' as Href)}
                style={styles.linkBtn}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/host-signup' as Href)}
                style={styles.linkBtn}>
                <Text style={styles.linkText}>Create account</Text>
              </Pressable>
            </View>

            <AppButton label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
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
  linksRow: {
    marginTop: SPACING[4],
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  linkBtn: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 14,
  },
  back: { marginTop: SPACING[3] },
});
