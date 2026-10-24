import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

type FilterItem<T extends string> = { id: T; label: string };

export function HostFilterChips<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabelFor,
  scrollable = false,
  style,
}: {
  items: readonly FilterItem<T>[];
  value: T;
  onChange: (id: T) => void;
  accessibilityLabelFor?: (item: FilterItem<T>) => string;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const chips = items.map((item) => {
    const on = value === item.id;
    return (
      <Pressable
        key={item.id}
        style={[styles.chip, on && styles.chipOn]}
        onPress={() => onChange(item.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={accessibilityLabelFor ? accessibilityLabelFor(item) : item.label}>
        <Text style={[styles.chipLabel, on && styles.chipLabelOn]} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={style}
        contentContainerStyle={styles.filters}>
        {chips}
      </ScrollView>
    );
  }

  return <View style={[styles.filters, styles.filtersWrap, style]}>{chips}</View>;
}

export function HostSearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.searchWrap, style]}>
      <Ionicons name="search-outline" size={18} color="#8A7F89" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A7F89"
        style={styles.search}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filtersWrap: {
    flexWrap: 'wrap',
  },
  chip: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipOn: {
    backgroundColor: '#6B3A5C',
    borderColor: '#6B3A5C',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  chipLabelOn: { color: COLORS.white },
  searchWrap: {
    height: 44,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8DFE6',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  search: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    paddingVertical: 0,
  },
});
