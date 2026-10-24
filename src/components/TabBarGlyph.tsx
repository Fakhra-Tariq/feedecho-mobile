import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

const TAB_IDLE = '#8A7F89';

type Props = {
  focused: boolean;
  outline: keyof typeof Ionicons.glyphMap;
  filled?: keyof typeof Ionicons.glyphMap;
};

/**
 * Host/audience tab icon: inactive outline, active filled icon in a plum pill.
 */
export function TabBarGlyph({ focused, outline, filled }: Props) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [focused, progress]);

  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(241,228,236,0)', COLORS.plumTint],
  });

  return (
    <Animated.View style={[styles.pill, { backgroundColor }]}>
      <Ionicons
        name={focused && filled ? filled : outline}
        size={22}
        color={focused ? COLORS.plum : TAB_IDLE}
      />
    </Animated.View>
  );
}

/** Inactive label color for tabBarLabelStyle — matches TabBarGlyph idle icons. */
export const TAB_BAR_INACTIVE_COLOR = TAB_IDLE;

export function TabBarLabel({ focused, children }: { focused: boolean; children: string }) {
  return (
    <Text
      style={[styles.label, focused ? styles.labelOn : styles.labelOff]}
      numberOfLines={1}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    marginTop: 2,
  },
  labelOn: {
    color: COLORS.plumInk,
    fontWeight: FONT_WEIGHTS.bold,
  },
  labelOff: {
    color: TAB_IDLE,
    fontWeight: FONT_WEIGHTS.regular,
  },
});
