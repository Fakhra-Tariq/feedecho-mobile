import * as AuthSession from 'expo-auth-session';
import { ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  type UserCredential,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from '../../firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

/**
 * Web OAuth client ID from Firebase Console → Authentication → Google
 * (Web client ID). Required for native Expo AuthSession.
 * Expo web uses Firebase signInWithPopup and does not need this.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

/**
 * Stable AuthSession proxy redirect URI for Expo Go.
 *
 * expo-auth-session@57 removed `useProxy` from `makeRedirectUri`. The supported
 * equivalent is `AuthSession.getRedirectUrl()`, which builds:
 *   https://auth.expo.io/@<username>/<slug>
 *
 * When Expo CLI is not logged in (no originalFullName), fall back to
 * EXPO_PUBLIC_EXPO_OWNER / app.json owner / "feedecho" so the URI stays stable.
 */
function getAuthProxyRedirectUri(): string {
  const slug = Constants.expoConfig?.slug || 'mobile';
  const ownerFromEnv = (process.env.EXPO_PUBLIC_EXPO_OWNER || '').replace(/^@/, '').trim();
  const ownerFromConfig = (Constants.expoConfig?.owner || '').replace(/^@/, '').trim();
  const owner = ownerFromEnv || ownerFromConfig || 'feedecho';

  try {
    const fromExpo = AuthSession.getRedirectUrl();
    // Prefer a real Expo account URL when available; skip anonymous (unstable).
    if (fromExpo && !fromExpo.includes('@anonymous/')) {
      return fromExpo;
    }
  } catch {
    // Not logged in / originalFullName missing — use explicit owner below.
  }

  return `https://auth.expo.io/@${owner}/${slug}`;
}

/**
 * Open Google auth through https://auth.expo.io/@owner/slug/start so the
 * OAuth redirect_uri stays the stable proxy URL (not exp://ip:port).
 */
async function promptGoogleThroughAuthProxy(
  request: AuthSession.AuthRequest,
  options?: AuthSession.AuthRequestPromptOptions
): Promise<AuthSession.AuthSessionResult> {
  const redirectUri = request.redirectUri;
  const authUrl = request.url;
  if (!authUrl) {
    throw new Error('Google sign-in is not ready yet. Please try again.');
  }

  const returnUrl = AuthSession.getDefaultReturnUrl();
  const startUrl =
    `${redirectUri.replace(/\/$/, '')}/start?` +
    new URLSearchParams({ authUrl, returnUrl }).toString();

  const browserResult = await WebBrowser.openAuthSessionAsync(
    startUrl,
    returnUrl,
    options
  );

  if (browserResult.type !== 'success') {
    return { type: browserResult.type } as AuthSession.AuthSessionResult;
  }

  return request.parseReturnUrl(browserResult.url);
}

export function useGoogleIdTokenRequest() {
  const redirectUri = getAuthProxyRedirectUri();

  // useAuthRequest (not useIdTokenAuthRequest): on native, useIdTokenAuthRequest
  // forces the code flow. The auth proxy needs IdToken (implicit) with the Web client.
  const [request, response, promptAsync] = Google.useAuthRequest(
    GOOGLE_WEB_CLIENT_ID
      ? {
          clientId: GOOGLE_WEB_CLIENT_ID,
          iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
          androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
          redirectUri,
          responseType: ResponseType.IdToken,
        }
      : {
          clientId: 'unused.apps.googleusercontent.com',
          redirectUri,
          responseType: ResponseType.IdToken,
        }
  );

  const promptWithProxyLog: typeof promptAsync = ((options) => {
    const finalRedirectUri = request?.redirectUri ?? redirectUri;
    console.log('[Google Auth] redirect URI:', finalRedirectUri);

    if (Platform.OS === 'web') {
      return promptAsync(options);
    }

    if (!request) {
      throw new Error('Google sign-in is not ready yet. Please try again.');
    }

    return promptGoogleThroughAuthProxy(request, options);
  }) as typeof promptAsync;

  return [request, response, promptWithProxyLog] as const;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

/**
 * Firebase Auth Google sign-in.
 * - Web (Expo web): same as /Web — signInWithPopup
 * - Native: expo-auth-session via Auth Proxy → signInWithCredential
 */
export async function signInWithGoogleNative(
  promptAsync: ReturnType<typeof Google.useAuthRequest>[2]
): Promise<UserCredential> {
  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }

  if (!promptAsync) {
    throw new Error('Google sign-in is not ready yet. Please try again.');
  }

  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your Firebase Google Web client ID (Authentication → Sign-in method → Google).'
    );
  }

  const result = await promptAsync();
  if (result.type !== 'success') {
    if (result.type === 'dismiss' || result.type === 'cancel') {
      throw Object.assign(new Error('Sign-in was cancelled'), {
        code: 'auth/popup-closed-by-user',
      });
    }
    throw new Error('Google sign-in failed. Please try again.');
  }

  const idToken =
    result.params?.id_token ||
    (result as { authentication?: { idToken?: string } }).authentication?.idToken;

  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  return signInWithGoogleIdToken(idToken);
}
