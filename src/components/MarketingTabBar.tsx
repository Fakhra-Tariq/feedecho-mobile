import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import type { MarketingNavKey } from '@/components/MarketingHeader';

/** Icon + label row height (excluding safe-area inset). */
export const MARKETING_TAB_BAR_CONTENT_HEIGHT = 56;

const TABS: {
  key: MarketingNavKey;
  label: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
}[] = [
  {
    key: 'home',
    label: 'Home',
    href: '/' as Href,
    icon: 'book-outline',
    accessibilityLabel: 'Home',
  },
  {
    key: 'about',
    label: 'About',
    href: '/about' as Href,
    icon: 'school-outline',
    accessibilityLabel: 'About Us',
  },
  {
    key: 'contact',
    label: 'Contact',
    href: '/contact' as Href,
    icon: 'mail-outline',
    accessibilityLabel: 'Contact Us',
  },
];

type Props = {
  active: MarketingNavKey;
};

/**
 * Persistent bottom tabs for marketing screens (Home / About / Contact).
 * Replaces the former hamburger menu — same routes, same icons.
 * Sits as a flex sibling under the ScrollView (not absolute), hugging the
 * screen bottom with safe-area padding only — no extra spacer above it.
 */
export function MarketingTabBar({ active }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View
      style={[styles.bar, { paddingBottom: bottomPad }]}
      accessibilityRole="tablist">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (!isActive) router.push(tab.href);
            }}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.accessibilityLabel}>
            <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
              <Ionicons
                name={tab.icon}
                size={22}
                color={isActive ? COLORS.primary : COLORS.inkSecondary}
              />
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 6,
    // Intrinsic height from icons/labels + safe-area paddingBottom — do not
    // force a fixed height that leaves an empty band above the icons.
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MARKETING_TAB_BAR_CONTENT_HEIGHT - 6,
    gap: 2,
    paddingBottom: 2,
  },
  tabPressed: {
    opacity: 0.75,
  },
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: COLORS.plumTint,
  },
  label: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.inkSecondary,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
