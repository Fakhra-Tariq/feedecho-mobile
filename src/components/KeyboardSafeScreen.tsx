import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardAvoidingViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BOTTOM_GAP = 16;

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * When true (default), wraps children in a ScrollView with keyboard-friendly props.
   * Set false for chat / FlatList layouts that manage their own scrolling.
   */
  scroll?: boolean;
  /**
   * `screen` — use navigation header height as keyboardVerticalOffset when available.
   * `modal` — offset 0 (Modal hosts its own window; pair with an inner KAV).
   */
  variant?: 'screen' | 'modal';
  /** Extra offset added on top of the computed header / safe-area value. */
  offsetExtra?: number;
  /** Extra bottom padding inside the scroll content so the focused field clears the keyboard (~16). */
  bottomGap?: number;
  showsVerticalScrollIndicator?: boolean;
  /** Override KeyboardAvoidingView behavior (iOS only; Android uses a keyboard spacer). */
  behavior?: KeyboardAvoidingViewProps['behavior'];
};

/**
 * Keyboard height above the system nav bar.
 * Android edge-to-edge + `softwareKeyboardLayoutMode: pan` does not resize the window,
 * so KeyboardAvoidingView alone cannot lift fields — we add a spacer instead.
 * Subtract insets.bottom so we do not leave a gap above the keyboard.
 */
function useAndroidKeyboardSpacer() {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS !== 'android') return 0;
  return Math.max(0, keyboardHeight - insets.bottom);
}

function scrollFocusedInputIntoView(scrollRef: ScrollView | null) {
  if (!scrollRef) return;
  const input = TextInput.State.currentlyFocusedInput?.();
  if (!input) return;
  const handle = findNodeHandle(scrollRef);
  if (!handle) return;
  input.measureLayout(
    handle,
    (_x, y) => {
      scrollRef.scrollTo({ y: Math.max(0, y - 32), animated: true });
    },
    () => undefined
  );
}

/**
 * Shared keyboard avoidance for screens and modals.
 * iOS: KeyboardAvoidingView padding + header offset.
 * Android: keyboard spacer (KAV does not move the window under edge-to-edge + pan).
 */
export function KeyboardSafeScreen({
  children,
  style,
  contentContainerStyle,
  scroll = true,
  variant = 'screen',
  offsetExtra = 0,
  bottomGap = BOTTOM_GAP,
  showsVerticalScrollIndicator = false,
  behavior,
}: Props) {
  const offset = useKeyboardVerticalOffset(variant, offsetExtra);
  const androidSpacer = useAndroidKeyboardSpacer();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!scroll) return undefined;
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow',
      () => {
        requestAnimationFrame(() => scrollFocusedInputIntoView(scrollRef.current));
      }
    );
    return () => sub.remove();
  }, [scroll]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? behavior || 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            bottomGap > 0 ? { paddingBottom: bottomGap } : null,
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
      {androidSpacer > 0 ? <View style={{ height: androidSpacer }} /> : null}
    </KeyboardAvoidingView>
  );
}

/** Alias requested by keyboard-handling work — same component. */
export const KeyboardAwareScreen = KeyboardSafeScreen;

/**
 * Header-aware offset for KeyboardAvoidingView.
 * Reads HeaderHeightContext without throwing when no header is present (modals / headerless screens).
 */
export function useKeyboardVerticalOffset(
  variant: 'screen' | 'modal' = 'screen',
  extra = 0
): number {
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext);

  if (variant === 'modal') {
    return extra;
  }

  if (typeof headerHeight === 'number' && headerHeight > 0) {
    return headerHeight + extra;
  }

  // Headerless screens: status-bar / notch inset only.
  return (Platform.OS === 'ios' ? insets.top : 0) + extra;
}

/** Shared ScrollView keyboard props for screens that keep their own ScrollView / FlatList. */
export const KEYBOARD_SCROLL_PROPS = {
  keyboardShouldPersistTaps: 'handled' as const,
  keyboardDismissMode: (Platform.OS === 'ios' ? 'interactive' : 'on-drag') as
    | 'interactive'
    | 'on-drag',
  automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
};

export const KEYBOARD_BOTTOM_GAP = BOTTOM_GAP;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
