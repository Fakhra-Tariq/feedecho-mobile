import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { getAudiencePostActivityHomeLabel } from '@/lib/audiencePostActivityHomeLabel';

type Props = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  icon?: boolean;
};

/**
 * Post-quiz / post-race leave button label. Destinations stay with the caller.
 */
export function AudiencePostActivityHomeButton({ onPress, style, labelStyle, icon }: Props) {
  const { profile, loading } = useAuth();
  const label = getAudiencePostActivityHomeLabel(profile, loading);

  if (!label) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Loading"
        accessibilityState={{ busy: true, disabled: true }}
        disabled
        activeOpacity={1}
        style={[styles.base, style, styles.loading]}>
        <View style={styles.skeleton} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.base, style]}>
      {icon ? <Ionicons name="arrow-back" size={20} color={COLORS.white} /> : null}
      <Text style={[styles.label, labelStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = {
  base: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexDirection: 'row' as const,
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
  },
  loading: { opacity: 0.55 },
  skeleton: {
    minHeight: 14,
    width: 168,
    maxWidth: '80%' as const,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  label: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 15,
    textAlign: 'center' as const,
    flexShrink: 1,
  },
};
