import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';

/** Visual height of tab icons + labels (excluding system nav / home-indicator inset). */
export const TAB_BAR_CONTENT_HEIGHT = 58;

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
