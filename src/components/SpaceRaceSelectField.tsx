import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';

export type SelectOption<T extends string | number = string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  accessibilityLabel?: string;
};

/**
 * Lightweight dropdown (no new deps) — Pressable field + modal option list.
 * Used for Space Race team count, durations, and race icon.
 */
export function SpaceRaceSelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  accessibilityLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={({ pressed }) => [styles.field, error && styles.fieldError, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}>
        <Text style={styles.fieldText} numberOfLines={1}>
          {selected?.label ?? String(value)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.inkSecondary} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              style={styles.sheetList}
              renderItem={({ item }) => {
                const on = item.value === value;
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      on && styles.optionOn,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={item.label}>
                    <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>{item.label}</Text>
                    {on ? <Ionicons name="checkmark" size={18} color={COLORS.primary} /> : null}
                  </Pressable>
                );
              }}
            />
            <Pressable
              style={styles.cancel}
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function formatQuizDurationLabel(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export function formatJoinDurationLabel(minutes: number) {
  if (minutes === 60) return '1 hour';
  return `${minutes} minutes`;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.inkSecondary,
  },
  field: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fieldError: { borderColor: COLORS.danger },
  fieldText: { flex: 1, fontSize: 14, color: COLORS.ink },
  hint: { fontSize: 12, color: COLORS.inkSecondary, lineHeight: 16 },
  error: { fontSize: 12, color: COLORS.dangerText },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING[4],
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ink,
    marginBottom: SPACING[3],
  },
  sheetList: { maxHeight: 360 },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[3],
    borderRadius: RADIUS.md,
  },
  optionOn: { backgroundColor: COLORS.blush },
  optionLabel: { fontSize: 15, color: COLORS.ink },
  optionLabelOn: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.primary },
  cancel: {
    marginTop: SPACING[3],
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceMuted,
  },
  cancelLabel: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink },
  pressed: { opacity: 0.85 },
});
