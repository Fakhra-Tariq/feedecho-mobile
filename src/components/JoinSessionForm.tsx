import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthDivider, GoogleSignInButton } from '@/components/AuthExtras';
import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useGoogleIdTokenRequest } from '@/lib/googleAuth';
import {
  stashActivityEntrySource,
  type ActivityEntrySource,
} from '@/lib/audienceHomeNavigation';
import { navigateToJoinedActivity } from '@/lib/joinSessionNavigation';

type Props = {
  showBack?: boolean;
  /** Where this join form was opened from. */
  entrySource: ActivityEntrySource;
};

export function JoinSessionForm({ showBack = false, entrySource }: Props) {
  const { joinSession, audienceSignIn, audienceSignInWithGoogle, profile } = useAuth();
  const [, , promptAsync] = useGoogleIdTokenRequest();

  const [name, setName] = useState(profile?.name || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const onSubmit = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    await stashActivityEntrySource(entrySource);
    const result = await joinSession({ name, code });
    setSubmitting(false);
    if (result.success) {
      const navigated = await navigateToJoinedActivity(result, entrySource);
      if (!navigated) {
        setError('Unsupported or incomplete session activity. Please try again.');
      }
      return;
    }
    setError(result.error || 'Failed to join session. Please try again.');
  };

  const onGoogleLogin = async () => {
    if (authSubmitting) return;
    setAuthError('');
    setAuthSubmitting(true);
    setGoogleLoading(true);
    const result = await audienceSignInWithGoogle(promptAsync);
    setGoogleLoading(false);
    setAuthSubmitting(false);
    if (result.success) {
      router.replace('/audience' as Href);
      return;
    }
    setAuthError(result.error || 'Google sign-in failed. Please try again.');
  };

  const onEmailLogin = async () => {
    if (authLoading || authSubmitting) return;
    if (!loginEmail.trim()) {
      setAuthError('Email is required');
      return;
    }
    if (!loginPassword) {
      setAuthError('Password is required');
      return;
    }
    setAuthError('');
    setAuthSubmitting(true);
    setAuthLoading(true);
    const result = await audienceSignIn(loginEmail, loginPassword);
    setAuthLoading(false);
    setAuthSubmitting(false);
    if (result.success) {
      router.replace('/audience' as Href);
      return;
    }
    setAuthError(result.error || 'Login failed. Please try again.');
  };

  return (
    <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
        <AppCard style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="keypad-outline" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Join a Session</Text>
          <Text style={styles.subtitle}>
            Enter your name and the session code shared by your host.
          </Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoCorrect={false}
            placeholder="Your name"
            placeholderTextColor={COLORS.darkTextSecondary}
            style={styles.input}
          />
          <Text style={styles.label}>Session code</Text>
          <TextInput
            value={code}
            onChangeText={(value) =>
              setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
            }
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            placeholder="6-character code"
            placeholderTextColor={COLORS.darkTextSecondary}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton
            label={submitting ? 'Joining...' : 'Join Session'}
            icon="arrow-forward-outline"
            loading={submitting}
            onPress={onSubmit}
            disabled={submitting}
          />

          <AuthDivider label="already have an account?" />

          {authError ? <Text style={styles.error}>{authError}</Text> : null}

          <GoogleSignInButton
            onPress={onGoogleLogin}
            loading={googleLoading}
            disabled={googleLoading || authSubmitting}
          />

          {!showEmailLogin ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowEmailLogin(true)}
              style={styles.linkBtn}>
              <Text style={styles.linkText}>Sign in with email instead</Text>
            </Pressable>
          ) : (
            <View style={styles.emailBlock}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={loginEmail}
                onChangeText={setLoginEmail}
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
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                textContentType="password"
                placeholder="Password"
                placeholderTextColor={COLORS.darkTextSecondary}
                style={styles.input}
              />
              <AppButton
                label={authLoading ? 'Signing in...' : 'Sign In'}
                loading={authLoading}
                onPress={onEmailLogin}
                disabled={authLoading || authSubmitting}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/audience-forgot' as Href)}
                style={styles.forgotRow}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            </View>
          )}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/audience-signup' as Href)}
            style={styles.signupRow}>
            <Text style={styles.linkText}>No account? Sign up</Text>
          </Pressable>

          {showBack ? (
            <AppButton label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
          ) : null}
        </AppCard>
    </KeyboardSafeScreen>
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
  emailBlock: { marginTop: SPACING[4] },
  linkBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[4],
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 14,
  },
  forgotRow: {
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: SPACING[2],
  },
  signupRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[4],
  },
  back: { marginTop: SPACING[3] },
});
