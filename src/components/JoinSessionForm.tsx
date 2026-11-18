import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthDivider, GoogleSignInButton } from '@/components/AuthExtras';
import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { SpaceRaceTeamSelect } from '@/components/SpaceRaceTeamSelect';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useGoogleIdTokenRequest } from '@/lib/googleAuth';
import {
  stashActivityEntrySource,
  type ActivityEntrySource,
} from '@/lib/audienceHomeNavigation';
import { markGuestSessionActive } from '@/lib/guestSession';
import { navigateToJoinedActivity } from '@/lib/joinSessionNavigation';

type Props = {
  showBack?: boolean;
  /** Where this join form was opened from. */
  entrySource: ActivityEntrySource;
  /** Guest banner "Log in" — keep activity mounted underneath and return after sign-in. */
  fromBanner?: boolean;
  prefillCode?: string;
  prefillName?: string;
  useDifferentName?: boolean;
};

export function JoinSessionForm({
  showBack = false,
  entrySource,
  fromBanner = false,
  prefillCode = '',
  prefillName = '',
  useDifferentName = false,
}: Props) {
  const { joinSession, audienceSignIn, audienceSignInWithGoogle, profile, isHost } = useAuth();
  const [, , promptAsync] = useGoogleIdTokenRequest();
  const showAuthExtras = (entrySource === 'public' || fromBanner) && !isHost;

  const [name, setName] = useState(profile?.name || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [raceData, setRaceData] = useState<any>(null);
  const [showTeamSelection, setShowTeamSelection] = useState(false);
  const [pendingJoin, setPendingJoin] = useState<{ trimmedName: string; trimmedCode: string } | null>(
    null
  );

  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    const paramCode = String(prefillCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    if (paramCode) setCode(paramCode);
    if (useDifferentName) setName('');
  }, [prefillCode, useDifferentName]);

  useEffect(() => {
    if (!fromBanner) return;
    let cancelled = false;
    void (async () => {
      const paramCode = String(prefillCode || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      const storedCode = String((await AsyncStorage.getItem('sessionCode')) || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
      const storedName = String((await AsyncStorage.getItem('studentName')) || '').trim();
      if (cancelled) return;
      const nextCode = paramCode || storedCode;
      if (nextCode) setCode(nextCode);
      if (useDifferentName) {
        setName('');
        return;
      }
      const nextName = String(prefillName || '').trim() || storedName;
      if (nextName) setName((prev) => prev || nextName);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromBanner, prefillCode, prefillName, useDifferentName]);

  const returnAfterBannerLogin = () => {
    if (fromBanner && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/audience' as Href);
  };

  const runJoin = async (trimmedName: string, trimmedCode: string, teamId: number | null = null) => {
    setError('');
    setSubmitting(true);
    try {
      // Marker must exist before isStudent flips so guards never treat this
      // code-join as a logged-in student landing on Home/Progress/Study/Profile.
      if (entrySource === 'public') markGuestSessionActive();
      await stashActivityEntrySource(entrySource);
      const result = await joinSession({ name: trimmedName, code: trimmedCode, teamId });
      // TEMP DEBUG — remove after guest join is confirmed
      console.log('[TEMP DEBUG] join success', {
        code: trimmedCode,
        activityType: result.activityType,
        success: result.success,
        needsTeamSelection: result.needsTeamSelection,
        error: result.error || null,
        entrySource,
        quizId: result.quizId || null,
        raceId: result.raceId || null,
      });

      if (result.needsTeamSelection) {
        setRaceData(result.raceData || { id: result.raceId });
        setPendingJoin({ trimmedName, trimmedCode });
        setShowTeamSelection(true);
        return;
      }

      if (result.success) {
        const navigated = await navigateToJoinedActivity(result, entrySource);
        if (!navigated) {
          setError('Unsupported or incomplete session activity. Please try again.');
        }
        return;
      }

      const joinError = result.error || 'Failed to join session. Please try again.';
      if (/already been used on this device/i.test(joinError)) {
        return;
      }
      setError(joinError);
    } catch {
      setError('Failed to join session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) return;
    if (trimmedCode.length !== 6) {
      setError('Session code must be exactly 6 characters');
      return;
    }
    await runJoin(trimmedName, trimmedCode);
  };

  const onTeamContinue = async (teamId: number) => {
    if (!pendingJoin) {
      setError('Please select a team');
      return;
    }
    setShowTeamSelection(false);
    await runJoin(pendingJoin.trimmedName, pendingJoin.trimmedCode, teamId);
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
      console.log('[TEMP DEBUG] JoinSessionForm Google login', { fromBanner, to: fromBanner ? 'back' : '/audience' });
      returnAfterBannerLogin();
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
      console.log('[TEMP DEBUG] JoinSessionForm email login', { fromBanner, to: fromBanner ? 'back' : '/audience' });
      returnAfterBannerLogin();
      return;
    }
    setAuthError(result.error || 'Login failed. Please try again.');
  };

  if (showTeamSelection) {
    return (
      <SpaceRaceTeamSelect
        raceData={raceData}
        isLoading={submitting}
        error={error}
        onContinue={onTeamContinue}
        onBack={() => {
          setShowTeamSelection(false);
          setRaceData(null);
          setPendingJoin(null);
          setError('');
        }}
      />
    );
  }

  return (
    <KeyboardSafeScreen style={styles.screen} contentContainerStyle={styles.scroll}>
      <AppCard style={styles.card}>
        <Text style={styles.title}>Join Session</Text>
        <Text style={styles.subtitle}>
          Enter your name and the session code shared by your host.
        </Text>
        <Text style={styles.label}>Your Name</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError('');
          }}
          autoCorrect={false}
          placeholder="e.g. Ali"
          placeholderTextColor={COLORS.darkTextSecondary}
          editable={!submitting}
          style={styles.input}
        />
        <Text style={styles.label}>Session Code</Text>
        <TextInput
          value={code}
          onChangeText={(value) => {
            setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
            if (error) setError('');
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="e.g. AB12CD"
          placeholderTextColor={COLORS.darkTextSecondary}
          editable={!submitting}
          style={styles.input}
        />
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        <AppButton
          label={submitting ? 'Joining...' : 'Join Session'}
          loading={submitting}
          onPress={onSubmit}
          disabled={submitting}
        />

        {showAuthExtras ? (
          <>
            <AuthDivider label="already have an account?" />

            {authError ? (
              <View style={styles.errorBox}>
                <Text style={styles.error}>{authError}</Text>
              </View>
            ) : null}

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
                  placeholderTextColor={COLORS.darkTextSecondary}
                  style={styles.input}
                />
                <Text style={styles.label}>Password</Text>
                <TextInput
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                  secureTextEntry
                  textContentType="password"
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
          </>
        ) : null}

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
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[10],
  },
  card: { ...SHADOWS.raised },
  title: { ...TYPE.title, fontSize: 24, marginBottom: SPACING[2] },
  subtitle: {
    ...TYPE.body,
    color: COLORS.darkTextSecondary,
    marginBottom: SPACING[6],
  },
  label: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.darkTextSecondary,
    marginBottom: SPACING[2],
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    minHeight: 44,
    color: COLORS.text,
    marginBottom: SPACING[4],
    backgroundColor: COLORS.white,
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginBottom: SPACING[4],
  },
  error: { color: COLORS.dangerText, fontSize: 14 },
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
