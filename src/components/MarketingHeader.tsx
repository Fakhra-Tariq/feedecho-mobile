import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, SPACING } from '@/constants/theme';

export type MarketingNavKey = 'home' | 'about' | 'contact';

type Props = {
  active: MarketingNavKey;
};

/**
 * Marketing pages header — left-aligned FeedEcho logo (wordmark + tagline in asset).
 * Asset is a cropped wide wordmark with @1x/@2x/@3x density variants under
 * `assets/images/FeedEcho-logo*.png` (copied from Web, not imported from /Web).
 * Navigation lives in MarketingTabBar at the bottom.
 */
export function MarketingHeader({ active: _active }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, SPACING[2]) }]}>
      <Pressable
        onPress={() => router.push('/' as Href)}
        style={styles.brand}
        accessibilityRole="button"
        accessibilityLabel="FeedEcho Home">
        <Image
          source={require('../../assets/images/FeedEcho-logo.png')}
          style={styles.logo}
          contentFit="contain"
          contentPosition="left center"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    // Match Home hero / card horizontal inset (SPACING[6]), not centered.
    paddingHorizontal: SPACING[6],
    paddingBottom: SPACING[2],
    backgroundColor: 'rgba(244,241,236,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.cardBorder,
    zIndex: 20,
  },
  brand: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    // Do not flex:1 — that stretched the logo/tagline across the full header.
    flexGrow: 0,
    flexShrink: 1,
  },
  logo: {
    // Cropped wordmark aspect ~3:1. Height matches prior header; width fits
    // the mark so it is not letterboxed tiny inside a square source.
    height: 56,
    width: 168,
    maxWidth: '100%',
    // Matches Web Navbar `mix-blend-multiply` so the logo’s black
    // canvas blends into the cream header background.
    mixBlendMode: 'multiply',
  },
});
