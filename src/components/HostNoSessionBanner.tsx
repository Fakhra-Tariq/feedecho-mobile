import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';

const BANNER_BG = '#F1E5EB';
const BANNER_BORDER = 'rgba(109, 65, 95, 0.2)';
const LINK_COLOR = '#6D415F';

type Props = {
  onCreateSession: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Idle session strip used on Library, Quiz, Live Chat, Exit Ticket, and Space Race.
 * Active "Launching to session: …" banners stay on each screen.
 */
export function HostNoSessionBanner({ onCreateSession, style }: Props) {
  return (
    <View style={[styles.banner, style]} accessibilityRole="text">
      <Ionicons name="warning-outline" size={16} color={COLORS.primary} />
      <Text style={styles.bannerText}>
        {"You'll need an active session to launch this. "}
        <Text
          style={styles.bannerLink}
          onPress={onCreateSession}
          accessibilityRole="button"
          accessibilityLabel="Create Session">
          Create Session
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: BANNER_BG,
    borderWidth: 1,
    borderColor: BANNER_BORDER,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
  },
  bannerText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  bannerLink: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: LINK_COLOR,
    textDecorationLine: 'underline',
  },
});
