import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  type UserCredential,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { auth } from '../../firebaseConfig';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

export const GOOGLE_UNAVAILABLE_MESSAGE =
  "Google sign-in isn't available right now. Use email and password instead.";

export type GooglePromptResult = {
  type: string;
  params?: { id_token?: string };
  authentication?: { idToken?: string };
};

export type GooglePromptFn = (options?: Record<string, unknown>) => Promise<GooglePromptResult>;

type ExpoAuthModules = {
  AuthSession: typeof import('expo-auth-session');
  Google: typeof import('expo-auth-session/providers/google');
  WebBrowser: typeof import('expo-web-browser');
  Constants: typeof import('expo-constants');
};

let expoAuthCache: ExpoAuthModules | null | undefined;

function loadExpoAuthModules(): ExpoAuthModules | null {
  if (expoAuthCache !== undefined) return expoAuthCache;
  try {
    const AuthSession = require('expo-auth-session') as ExpoAuthModules['AuthSession'];
    const Google = require('expo-auth-session/providers/google') as ExpoAuthModules['Google'];
    const WebBrowser = require('expo-web-browser') as ExpoAuthModules['WebBrowser'];
    const Constants = require('expo-constants') as ExpoAuthModules['Constants'];
    WebBrowser.maybeCompleteAuthSession();
    expoAuthCache = { AuthSession, Google, WebBrowser, Constants };
    return expoAuthCache;
  } catch (error) {
    console.log('[Google Auth] failed to load expo-auth-session / ExpoCrypto', error);
    expoAuthCache = null;
    return null;
  }
}

async function createNonce(): Promise<string> {
  try {
    const Crypto = require('expo-crypto') as typeof import('expo-crypto');
    if (typeof Crypto.randomUUID === 'function') {
      return String(Crypto.randomUUID()).replace(/-/g, '');
    }
    const bytes = await Crypto.getRandomBytesAsync(16);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.log('[Google Auth] nonce generation failed', error);
    throw googleUnavailableError();
  }
}

function googleUnavailableError() {
  return Object.assign(new Error(GOOGLE_UNAVAILABLE_MESSAGE), {
    code: 'auth/google-unavailable',
  });
}

function getAuthProxyRedirectUri(mods: ExpoAuthModules): string {
  const slug = mods.Constants.expoConfig?.slug || 'mobile';
  const ownerFromEnv = (process.env.EXPO_PUBLIC_EXPO_OWNER || '').replace(/^@/, '').trim();
  const ownerFromConfig = (mods.Constants.expoConfig?.owner || '').replace(/^@/, '').trim();
  const owner = ownerFromEnv || ownerFromConfig || 'feedecho';

  try {
    const fromExpo = mods.AuthSession.getRedirectUrl();
    if (fromExpo && !fromExpo.includes('@anonymous/')) {
      return fromExpo;
    }
  } catch {
    // Not logged in / originalFullName missing — use explicit owner below.
  }

  return `https://auth.expo.io/@${owner}/${slug}`;
}

async function promptGoogleThroughAuthProxy(
  mods: ExpoAuthModules,
  request: import('expo-auth-session').AuthRequest,
  options?: Record<string, unknown>
): Promise<GooglePromptResult> {
  const redirectUri = request.redirectUri;
  const authUrl = request.url;
  if (!authUrl) {
    throw new Error('Google sign-in is not ready yet. Please try again.');
  }

  const returnUrl = mods.AuthSession.getDefaultReturnUrl();
  const startUrl =
    `${redirectUri.replace(/\/$/, '')}/start?` +
    new URLSearchParams({ authUrl, returnUrl }).toString();

  const browserResult = await mods.WebBrowser.openAuthSessionAsync(
    startUrl,
    returnUrl,
    options
  );

  if (browserResult.type !== 'success') {
    return { type: browserResult.type };
  }

  return request.parseReturnUrl(browserResult.url) as GooglePromptResult;
}

/**
 * Hook-compatible API for login screens. Native Expo modules are loaded only
 * when promptAsync runs (Google button press), not at app startup.
 */
export function useGoogleIdTokenRequest() {
  const promptAsync: GooglePromptFn = async (options) => {
    const mods = loadExpoAuthModules();
    if (!mods) throw googleUnavailableError();

    try {
      const redirectUri = getAuthProxyRedirectUri(mods);
      const ResponseType = mods.AuthSession.ResponseType;
      const nonce = await createNonce();
      const request = await mods.AuthSession.loadAsync(
        GOOGLE_WEB_CLIENT_ID
          ? {
              clientId: GOOGLE_WEB_CLIENT_ID,
              redirectUri,
              responseType: ResponseType.IdToken,
              scopes: [
                'openid',
                'https://www.googleapis.com/auth/userinfo.profile',
                'https://www.googleapis.com/auth/userinfo.email',
              ],
              extraParams: { nonce },
              usePKCE: false,
            }
          : {
              clientId: 'unused.apps.googleusercontent.com',
              redirectUri,
              responseType: ResponseType.IdToken,
              extraParams: { nonce },
              usePKCE: false,
            },
        mods.Google.discovery
      );

      console.log('[Google Auth] request', {
        response_type: 'id_token',
        nonce: Boolean(nonce),
        pkce: false,
        redirect_uri: request.redirectUri ?? redirectUri,
        client: 'web',
      });

      if (Platform.OS === 'web') {
        return (await request.promptAsync(mods.Google.discovery, options)) as GooglePromptResult;
      }

      return await promptGoogleThroughAuthProxy(mods, request, options);
    } catch (error) {
      console.log('[Google Auth] prompt failed', error);
      const message = error instanceof Error ? error.message : String(error);
      if (/Cannot find native module|ExpoCrypto|expo-auth-session/i.test(message)) {
        throw googleUnavailableError();
      }
      throw error;
    }
  };

  return [null, null, promptAsync] as const;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function signInWithGoogleNative(
  promptAsync: GooglePromptFn
): Promise<UserCredential> {
  if (Platform.OS === 'web') {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  }

  if (!promptAsync) {
    throw googleUnavailableError();
  }

  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your Firebase Google Web client ID (Authentication → Sign-in method → Google).'
    );
  }

  let result: GooglePromptResult;
  try {
    result = await promptAsync();
  } catch (error) {
    console.log('[Google Auth] promptAsync error', error);
    const message = error instanceof Error ? error.message : String(error);
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      String((error as { code?: string }).code) === 'auth/google-unavailable'
    ) {
      throw error;
    }
    if (/Cannot find native module|ExpoCrypto|expo-auth-session/i.test(message)) {
      throw googleUnavailableError();
    }
    throw error;
  }

  if (result.type !== 'success') {
    if (result.type === 'dismiss' || result.type === 'cancel') {
      throw Object.assign(new Error('Sign-in was cancelled'), {
        code: 'auth/popup-closed-by-user',
      });
    }
    throw new Error('Google sign-in failed. Please try again.');
  }

  const idToken =
    result.params?.id_token || result.authentication?.idToken;

  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  return signInWithGoogleIdToken(idToken);
}
