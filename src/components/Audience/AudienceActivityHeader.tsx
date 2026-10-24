import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { hostInitials } from '@/lib/hostProfile';

type Props = {
  title: string;
  titleIcon?: keyof typeof Ionicons.glyphMap;
  participantName: string;
  isLoggedIn: boolean;
  onLogoPress?: () => void;
};

/** Compact activity chrome: logo + race title + guest name or avatar. */
export function AudienceActivityHeader({
  title,
  titleIcon = 'rocket',
  participantName,
  isLoggedIn,
  onLogoPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const name = participantName.trim() || 'Audience';
  const initials = name ? hostInitials(name) : 'A';

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, SPACING[2]) }]}>
      <Pressable
        onPress={onLogoPress}
        accessibilityRole="button"
        accessibilityLabel="Leave"
        style={styles.logoHit}>
        <Image
          source={require('../../../assets/images/FeedEcho-logo.png')}
          style={styles.logo}
          contentFit="contain"
          contentPosition="left center"
          accessibilityLabel="FeedEcho"
          accessibilityIgnoresInvertColors
        />
      </Pressable>

      <View style={styles.titleRow}>
        <Ionicons name={titleIcon} size={16} color={COLORS.primary} />
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
      </View>

      {isLoggedIn ? (
        <View style={styles.avatar} accessibilityLabel={name}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      ) : (
        <Text style={styles.guestName} numberOfLines={1}>
          {name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING[3],
    paddingBottom: SPACING[2],
    minHeight: 56,
  },
  logoHit: { flexShrink: 0 },
  logo: {
    height: 48,
    width: 132,
    mixBlendMode: 'multiply',
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  guestName: {
    maxWidth: 88,
    fontSize: 12,
    color: COLORS.inkSecondary,
    textAlign: 'right',
    flexShrink: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
