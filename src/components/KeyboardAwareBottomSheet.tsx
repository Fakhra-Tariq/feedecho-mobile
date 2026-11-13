import { type ReactNode } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useClosedWindowHeight,
  useModalKeyboardLift,
} from '@/components/KeyboardSafeScreen';

/** Matches Web mobile overlay: min(75vh, 32rem). */
const SHEET_MAX_PX = 512;
const SHEET_FRACTION = 0.75;

type Props = {
  visible: boolean;
  onClose: () => void;
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
};

/**
 * Bottom sheet hosted in a React Native Modal (separate Android window).
 *
 * Do not use activity-window "remaining overlap": when Expo Go resizes the
 * activity, overlap becomes 0 while this Modal still covers the IME.
 * Lift the sheet by the IME frame vs screen height, shrink height so the
 * header stays on screen, and pin the footer (composer) to the sheet bottom.
 */
export function KeyboardAwareBottomSheet({
  visible,
  onClose,
  header,
  footer,
  children,
  sheetStyle,
}: Props) {
  const insets = useSafeAreaInsets();
  const lift = useModalKeyboardLift();
  const closedH = useClosedWindowHeight();
  const topGap = Math.max(insets.top, 12);
  const screenH = Math.round(Dimensions.get('screen').height);
  const base = Math.min(
    Math.round(closedH * SHEET_FRACTION),
    SHEET_MAX_PX,
    Math.max(280, closedH - topGap)
  );
  const available = Math.max(200, screenH - lift - topGap);
  const sheetH = Math.min(base, available);
  const keyboardOpen = lift > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.sheet,
            { height: sheetH, marginBottom: lift },
            sheetStyle,
          ]}>
          {header}
          <View style={styles.body}>{children}</View>
          {footer ? (
            <View
              style={{
                paddingBottom: keyboardOpen ? 0 : Math.max(insets.bottom, 8),
              }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export const KeyboardSafeSheet = KeyboardAwareBottomSheet;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
