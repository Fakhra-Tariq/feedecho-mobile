import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';

type Props = {
  onBack: () => void;
};

/** Same Time's Up copy, icon, and Back to Race action as Web SpaceRaceQuizClosedCard. */
export function SpaceRaceQuizClosedCard({ onBack }: Props) {
  return (
    <View style={styles.card}>
      <Ionicons name="time-outline" size={56} color="#DC2626" />
      <Text style={styles.heading}>Time's Up</Text>
      <Text style={styles.hint}>
        This quiz is closed. Your team&apos;s time has ended, so it can no longer be opened or
        attempted.
      </Text>
      <TouchableOpacity style={styles.primary} onPress={onBack} accessibilityRole="button">
        <Text style={styles.primaryLabel}>Back to Race</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[6],
    alignItems: 'center',
    gap: SPACING[3],
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: FONT_WEIGHTS.bold, textAlign: 'center' },
  hint: { color: COLORS.inkSecondary, textAlign: 'center', lineHeight: 22 },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
    alignSelf: 'stretch',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
});
