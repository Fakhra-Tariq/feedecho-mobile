import { useRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS } from '@/constants/theme';

type Props = {
  digits: string[];
  onChangeDigits: (next: string[]) => void;
  disabled?: boolean;
  onSubmit?: () => void;
};

function sanitize(raw: string) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function SessionCodeBoxes({ digits, onChangeDigits, disabled, onSubmit }: Props) {
  const refs = useRef<Array<TextInput | null>>([null, null, null, null, null, null]);

  const applyPasted = (raw: string) => {
    const pasted = sanitize(raw);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length && i < 6; i += 1) next[i] = pasted[i];
    onChangeDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    requestAnimationFrame(() => refs.current[focusIndex]?.focus());
  };

  const onChangeAt = (index: number, value: string) => {
    const cleaned = sanitize(value);
    if (cleaned.length > 1) {
      applyPasted(cleaned);
      return;
    }
    const char = cleaned.slice(-1);
    const next = [...digits];
    next[index] = char;
    onChangeDigits(next);
    if (char && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    if (key === 'Backspace') {
      if (digits[index]) return;
      if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        onChangeDigits(next);
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (key === 'Enter') onSubmit?.();
  };

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digit}
          onChangeText={(value) => onChangeAt(index, value)}
          onKeyPress={(e) => onKeyPress(index, e)}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={6}
          editable={!disabled}
          selectTextOnFocus
          style={styles.box}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  box: {
    flex: 1,
    minWidth: 0,
    height: 44,
    minHeight: 44,
    backgroundColor: COLORS.mutedSoft,
    textAlign: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
    paddingHorizontal: 0,
  },
});
