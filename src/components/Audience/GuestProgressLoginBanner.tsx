import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { isAudienceJoinPath, setBannerJoinStackActive } from '@/lib/guestSession';
import { pushJoinSessionFromBanner } from '@/lib/joinSessionNavigation';

let dismissedThisSession = false;

type Props = {
  visible: boolean;
  /** Quiz-taking only: keep copy + Log in + X on a single row. */
  oneLine?: boolean;
};

/** Guest-only prompt matching Web GuestProgressLoginBanner. */
export function GuestProgressLoginBanner({ visible, oneLine = false }: Props) {
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const openingRef = useRef(false);
  const pathname = usePathname();

  if (!visible || dismissed) return null;

  const openJoin = () => {
    if (openingRef.current || isAudienceJoinPath(pathname)) return;
    openingRef.current = true;
    setBannerJoinStackActive(true);
    void pushJoinSessionFromBanner();
    setTimeout(() => {
      openingRef.current = false;
    }, 800);
  };

  return (
    <View style={[styles.bar, oneLine && styles.barOneLine]}>
      {oneLine ? (
        <Text
          style={[styles.copy, styles.copyOneLine]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.2}>
          Log in to save this to your progress history.{' '}
          <Text
            onPress={openJoin}
            accessibilityRole="link"
            accessibilityLabel="Log in"
            style={styles.link}>
            Log in
          </Text>
        </Text>
      ) : (
        <View style={styles.copyWrap}>
          <Text style={styles.copy}>
            Log in to save this to your progress history.{' '}
          </Text>
          <Pressable
            onPress={openJoin}
            accessibilityRole="link"
            accessibilityLabel="Log in"
            hitSlop={8}
            style={styles.linkHit}>
            <Text style={styles.link}>Log in</Text>
          </Pressable>
        </View>
      )}
      <Pressable
        onPress={() => {
          dismissedThisSession = true;
          setDismissed(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={oneLine ? { top: 12, bottom: 12, left: 12, right: 12 } : 8}
        style={[styles.dismiss, oneLine && styles.dismissOneLine]}>
        <Ionicons name="close" size={16} color={COLORS.inkSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.blush,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  copy: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.text,
  },
  linkHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  link: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  dismiss: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barOneLine: {
    marginHorizontal: -SPACING[4],
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[1],
    gap: SPACING[1],
  },
  copyOneLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  dismissOneLine: {
    minWidth: 28,
    minHeight: 28,
    flexShrink: 0,
  },
});
