import type { Href } from 'expo-router';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

/**
 * Hide a Tabs screen from the bar without `href: null`.
 * `href: null` unregisters the route from Expo linking, so `router.push`
 * (Explore → Live Chat, code-join → quiz/chat/race) is a no-op.
 */
export function hiddenTabOptions(href: Href) {
  return {
    href,
    tabBarButton: () => null,
    tabBarItemStyle: { display: 'none' as const, width: 0, height: 0 },
  };
}

/** Visual height of tab icons + labels (excluding system nav / home-indicator inset). */
export const TAB_BAR_CONTENT_HEIGHT = 58;

const BOTTOM_GAP = 16;

/**
 * Space to keep a pinned input/footer above the Android/iOS system bar.
 * Pass tabBarVisible only when this screen actually shows the tab bar.
 * When the keyboard is open, KeyboardSafeScreen already lifts the composer
 * by remaining IME overlap + a 12px gap — do not add inset/gap again.
 */
export function useBottomSpace(options?: {
  tabBarVisible?: boolean;
  keyboardOpen?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const gap = BOTTOM_GAP;
  const tab = options?.tabBarVisible ? TAB_BAR_CONTENT_HEIGHT : 0;
  if (options?.keyboardOpen) return 0;
  return gap + insets.bottom + tab;
}

/**
 * Shared tabBarStyle for host + audience Tabs layouts.
 * Adds runtime bottom inset so the bar clears 3-button Android nav, gesture nav,
 * and the iOS home indicator — without a hardcoded pixel value.
 */
export function useSafeTabBarStyle(extra?: ViewStyle): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    backgroundColor: COLORS.white,
    borderTopColor: COLORS.cardBorder,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
    paddingTop: 4,
    paddingBottom: insets.bottom,
    ...extra,
  };
}
