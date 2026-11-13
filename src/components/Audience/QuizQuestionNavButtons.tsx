import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

type Props = {
  previousDisabled?: boolean;
  onPrevious: () => void;
  hidePrimary?: boolean;
  primaryLabel: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  /** Trailing chevron after Next (Web regular quiz / "Next →"). */
  showTrailingArrow?: boolean;
  /** Send icon after Submit Quiz (Web). */
  showSendIcon?: boolean;
};

/**
 * Previous | Next (or Submit / Finish) in one equal-width row,
 * matching Web mobile quiz: left grey Previous, right maroon primary.
 */
export function QuizQuestionNavButtons({
  previousDisabled,
  onPrevious,
  hidePrimary,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  showTrailingArrow,
  showSendIcon,
}: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPrevious}
        disabled={previousDisabled}
        style={[styles.btn, styles.prevBtn, previousDisabled && styles.prevBtnOff]}
        accessibilityRole="button"
        accessibilityLabel="Previous"
        accessibilityState={{ disabled: Boolean(previousDisabled) }}>
        <Ionicons
          name="arrow-back"
          size={16}
          color={previousDisabled ? '#9CA3AF' : '#6B7280'}
        />
        <Text
          style={[styles.prevLabel, previousDisabled && styles.prevLabelOff]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}>
          Previous
        </Text>
      </Pressable>

      {hidePrimary ? null : (
        <Pressable
          onPress={onPrimary}
          disabled={primaryDisabled || primaryBusy || !onPrimary}
          style={[styles.btn, styles.nextBtn, (primaryDisabled || primaryBusy) && styles.nextBtnOff]}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ disabled: Boolean(primaryDisabled || primaryBusy) }}>
          {primaryBusy ? <ActivityIndicator color={COLORS.white} size="small" /> : null}
          <Text
            style={styles.nextLabel}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}>
            {primaryLabel}
          </Text>
          {!primaryBusy && showTrailingArrow ? (
            <Text style={styles.nextLabel}>→</Text>
          ) : null}
          {!primaryBusy && showSendIcon ? (
            <Ionicons name="send" size={16} color={COLORS.white} />
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  prevBtn: {
    backgroundColor: '#E5E5E5',
    borderWidth: 0,
  },
  prevBtnOff: {
    backgroundColor: '#E5E5E5',
    opacity: 0.7,
  },
  prevLabel: {
    color: '#6B7280',
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 15,
    flexShrink: 1,
  },
  prevLabelOff: {
    color: '#9CA3AF',
  },
  nextBtn: {
    backgroundColor: COLORS.primary,
  },
  nextBtnOff: {
    backgroundColor: COLORS.muted,
    opacity: 0.7,
  },
  nextLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 15,
    flexShrink: 1,
  },
});
