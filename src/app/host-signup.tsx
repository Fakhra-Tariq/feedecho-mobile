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

export default function HostSignUpScreen() {
  const { hostSignUp, signInHostWithGoogle } = useAuth();
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const onSubmit = async () => {
    if (loading) return;
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const result = await hostSignUp({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (result.success) {
      router.replace('/host' as Href);
      return;
    }
    setError(result.error || 'Signup failed');
  };

  const onGoogle = async () => {
    if (loading) return;
    setError('');
    setGoogleLoading(true);
    setLoading(true);
    const result = await signInHostWithGoogle(promptAsync);
    setGoogleLoading(false);
    setLoading(false);
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
              <Ionicons name="person-add-outline" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Host Sign Up</Text>
            <Text style={styles.subtitle}>Create your host account to continue.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
            </View>

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

            <Text style={styles.label}>Re-enter password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
            />

            <AppButton
              label={loading && !googleLoading ? 'Creating...' : 'Create Account'}
              loading={loading && !googleLoading}
              onPress={onSubmit}
              disabled={loading}
            />

            <AuthDivider label="OR" />

            <GoogleSignInButton
              onPress={onGoogle}
              loading={googleLoading}
              disabled={loading}
            />

            <Pressable
              accessibilityRole="link"
              onPress={() => router.replace('/host-login' as Href)}
              style={styles.linkRow}>
              <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
  row: { flexDirection: 'row', gap: SPACING[3] },
  half: { flex: 1 },
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
  linkRow: {
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
});
