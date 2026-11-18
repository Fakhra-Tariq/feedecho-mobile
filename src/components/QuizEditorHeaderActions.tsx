import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ANOTHER_ACTIVITY_LIVE_HINT } from '@/lib/liveHostActivity';
import type { QuizEditorHeaderMode } from '@/lib/quizEditorSnapshot';
import { COLORS, FONT_WEIGHTS, RADIUS } from '@/constants/theme';

type Props = {
  mode: QuizEditorHeaderMode;
  saving?: boolean;
  launchBusy?: boolean;
  onSave: () => void;
  onLaunch: () => void;
};

const PLUM = COLORS.plum;
const PLUM_DARK = COLORS.plumInk;

export function QuizEditorHeaderActions({
  mode,
  saving = false,
  launchBusy = false,
  onSave,
  onLaunch,
}: Props) {
  const [stack, setStack] = useState(false);
  const launchEnabled = mode === 'saved' && !launchBusy;
  const launchDisabledReason = mode !== 'saved' ? 'Save your changes first' : ANOTHER_ACTIVITY_LIVE_HINT;

  const saveButton = (
    <Pressable
      onPress={onSave}
      disabled={saving}
      style={({ pressed }) => [
        styles.actionBtn,
        styles.plumBtn,
        saving && styles.saving,
        pressed && !saving && styles.plumPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={saving ? 'Saving' : 'Save Quiz'}
      accessibilityState={{ disabled: saving, busy: saving }}>
      <Ionicons name="save-outline" size={16} color={COLORS.white} />
      <Text style={styles.plumLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {saving ? 'Saving…' : 'Save Quiz'}
      </Text>
    </Pressable>
  );

  const savedStatus = (
    <View
      style={[styles.actionBtn, styles.savedStatus]}
      accessibilityRole="text"
      accessibilityLabel="Saved"
      accessibilityLiveRegion="polite">
      <Ionicons name="checkmark" size={16} color={COLORS.successAccent} />
      <Text style={styles.savedLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        Saved
      </Text>
    </View>
  );

  const launchButton = (
    <View style={styles.launchCol}>
      <Pressable
        onPress={launchEnabled ? onLaunch : undefined}
        disabled={!launchEnabled}
        style={({ pressed }) => [
          styles.actionBtn,
          styles.plumBtn,
          !launchEnabled && styles.launchDisabled,
          pressed && launchEnabled && styles.plumPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={launchEnabled ? 'Launch Quiz' : `Launch Quiz, ${launchDisabledReason}`}
        accessibilityHint={launchEnabled ? undefined : launchDisabledReason}
        accessibilityState={{ disabled: !launchEnabled }}>
        <Ionicons name="rocket-outline" size={16} color={COLORS.white} />
        <Text style={styles.plumLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          Launch Quiz
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View
      style={[styles.row, stack && styles.rowStacked]}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setStack(width > 0 && width < 320);
      }}>
      {mode === 'create' ? (
        <View style={[styles.item, stack && styles.itemStacked]}>{saveButton}</View>
      ) : (
        <>
          <View style={[styles.item, stack && styles.itemStacked]}>{launchButton}</View>
          <View style={[styles.item, stack && styles.itemStacked]}>
            {mode === 'saved' ? savedStatus : saveButton}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
  },
  rowStacked: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  item: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 148,
    minWidth: 148,
  },
  itemStacked: {
    minWidth: '100%',
    flexBasis: 'auto',
    width: '100%',
  },
  launchCol: {
    gap: 4,
  },
  actionBtn: {
    minHeight: 44,
    height: 44,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    width: '100%',
  },
  plumBtn: {
    backgroundColor: PLUM,
  },
  plumPressed: {
    backgroundColor: PLUM_DARK,
  },
  saving: {
    opacity: 0.7,
  },
  launchDisabled: {
    opacity: 0.5,
  },
  plumLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 14,
    flexShrink: 1,
  },
  savedStatus: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(107, 58, 92, 0.25)',
  },
  savedLabel: {
    color: PLUM_DARK,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 14,
    flexShrink: 1,
  },
});
