import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

export function HeroHowItWorksLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.howItWorks, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="How it works">
      <Ionicons name="help-circle-outline" size={14} color="#EADBE5" />
      <Text style={styles.howItWorksText} numberOfLines={1}>
        How it works
      </Text>
      <Ionicons name="chevron-forward" size={12} color="#EADBE5" />
    </Pressable>
  );
}

export function HeroStatTiles({
  items,
}: {
  items: { label: string; value: number | string }[];
}) {
  return (
    <View style={styles.stats}>
      {items.map((item) => (
        <View key={item.label} style={styles.stat}>
          <Text style={styles.statValue}>{item.value}</Text>
          <Text style={styles.statLabel} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  howItWorks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    flexShrink: 0,
  },
  howItWorksText: {
    fontSize: 12,
    color: '#EADBE5',
  },
  pressed: { opacity: 0.85 },
  stats: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 18,
  },
  statLabel: {
    color: '#EADBE5',
    fontSize: 11,
    marginTop: 2,
  },
});
