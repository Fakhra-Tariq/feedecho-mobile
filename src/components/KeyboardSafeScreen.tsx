import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardAvoidingViewProps,
  type ScaledSize,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BOTTOM_GAP = 16;
const FORM_EXTRA_PAD = 24;
const COMPOSER_GAP = 12;

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
  /** Override KeyboardAvoidingView behavior. Android still uses a keyboard spacer. */
  behavior?: KeyboardAvoidingViewProps['behavior'];
};

type NativeView = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

type ComposerAnchorCtx = {
  register: (node: NativeView | null) => void;
  onAnchorLayout: () => void;
};

const ComposerAnchorContext = createContext<ComposerAnchorCtx | null>(null);

type KeyboardCoords = { screenY: number; height: number };

export type KeyboardInset = {
  /** IME frame height from Keyboard events. */
  keyboardHeight: number;
  /** Extra bottom pad needed so the current window clears the IME. */
  overlap: number;
  screenY: number;
  windowH: number;
  shrunk: number;
  bottomInset: number;
};

function computeOverlap(coords: KeyboardCoords, closedWindowH: number): Omit<KeyboardInset, 'bottomInset'> {
  const kb = Math.max(0, Math.round(coords.height || 0));
  const screenY = Math.round(coords.screenY || 0);
  const windowH = Math.round(Dimensions.get('window').height);
  const shrunk = Math.max(0, Math.round(closedWindowH - windowH));
  // Prefer keyboard top in window space. Gboard's toolbar is often missing
  // from `height` but included in a higher (smaller) screenY after measure.
  const fromScreenY = screenY > 0 ? Math.max(0, windowH - screenY) : 0;
  const fromKb = Math.max(0, kb - shrunk);
  const overlap = Math.max(fromKb, fromScreenY);
  return { keyboardHeight: kb, overlap, screenY, windowH, shrunk };
}

/**
 * Real keyboard coverage of the *current* window.
 * Expo Go ignores app.json `softwareKeyboardLayoutMode` (prebuilt binary).
 * SDK 58 edge-to-edge often resizes only part of the IME (nav bar / a slice of
 * Gboard), so "use full height XOR 0" left the composer under the rest of the
 * keyboard. Remaining overlap = max(kb - shrunk, windowH - screenY).
 */
export function useKeyboardInset(): KeyboardInset {
  const insets = useSafeAreaInsets();
  const closedWindowH = useRef(Dimensions.get('window').height);
  const [value, setValue] = useState<KeyboardInset>({
    keyboardHeight: 0,
    overlap: 0,
    screenY: 0,
    windowH: Dimensions.get('window').height,
    shrunk: 0,
    bottomInset: insets.bottom,
  });

  useEffect(() => {
    const applyCoords = (coords?: KeyboardCoords | null, source = 'event') => {
      if (!coords || coords.height <= 0) {
        setValue({
          keyboardHeight: 0,
          overlap: 0,
          screenY: 0,
          windowH: Dimensions.get('window').height,
          shrunk: 0,
          bottomInset: insets.bottom,
        });
        return;
      }
      const next = computeOverlap(coords, closedWindowH.current);
      setValue({ ...next, bottomInset: insets.bottom });
      if (source === 'show' || source === 'hide') {
        // TEMP DEBUG — remove after Android keyboard inset is confirmed
        console.log('[TEMP DEBUG] keyboard inset', {
          source,
          platform: Platform.OS,
          kb: next.keyboardHeight,
          screenY: next.screenY,
          windowH: next.windowH,
          screenH: Math.round(Dimensions.get('screen').height),
          shrunk: next.shrunk,
          overlap: next.overlap,
          bottomInset: insets.bottom,
          oldAllOrNothingPad: next.keyboardHeight
            ? next.shrunk > next.keyboardHeight * 0.7
              ? 0
              : next.keyboardHeight
            : 0,
        });
      }
    };

    const onShow = (event: { endCoordinates: KeyboardCoords }) => {
      applyCoords(event.endCoordinates, 'show');
    };
    const onHide = () => {
      closedWindowH.current = Dimensions.get('window').height;
      applyCoords(null, 'hide');
    };

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const frameEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame';

    const show = Keyboard.addListener(showEvt, onShow);
    const hide = Keyboard.addListener(hideEvt, onHide);
    const frame = Keyboard.addListener(frameEvt, (event: { endCoordinates: KeyboardCoords }) => {
      applyCoords(event.endCoordinates, 'frame');
    });
    const dim = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      const metrics = typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : undefined;
      if (!metrics || metrics.height <= 0) {
        closedWindowH.current = window.height;
        applyCoords(null, 'dim');
        return;
      }
      applyCoords(metrics, 'dim');
    });

    return () => {
      show.remove();
      hide.remove();
      frame.remove();
      dim.remove();
    };
  }, [insets.bottom]);

  return value;
}

/** Remaining IME overlap (0 when the window already sits fully above the keyboard). */
export function useKeyboardOverlapHeight() {
  return useKeyboardInset().overlap;
}

/** Alias: keyboard overlap used to pad chat roots and modal bottoms. */
export function useKeyboardOverlap() {
  return useKeyboardInset();
}

/**
 * Lift (px) for a full-screen React Native Modal.
 * Android Modals are a separate window and do not shrink with the activity, so
 * `useKeyboardOverlapHeight()` (keyboard minus window shrink) is ~0 while the
 * IME still covers the modal. Always use the IME frame vs screen height.
 */
export function useModalKeyboardLift() {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const apply = (coords?: KeyboardCoords | null) => {
      if (!coords || coords.height <= 0) {
        setLift(0);
        return;
      }
      const screenH = Math.round(Dimensions.get('screen').height);
      const kb = Math.max(0, Math.round(coords.height || 0));
      const screenY = Math.round(coords.screenY || 0);
      const fromY = screenY > 0 ? Math.max(0, screenH - screenY) : 0;
      setLift(Math.max(kb, fromY));
    };

    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const frameEvt = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame';
    const onFrame = (event: { endCoordinates: KeyboardCoords }) => apply(event.endCoordinates);
    const show = Keyboard.addListener(showEvt, onFrame);
    const hide = Keyboard.addListener(hideEvt, () => apply(null));
    const frame = Keyboard.addListener(frameEvt, onFrame);
    return () => {
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, []);

  return lift;
}

/** True while the software keyboard is showing (does not depend on window resize). */
export function useKeyboardIsOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setOpen(true));
    const hide = Keyboard.addListener(hideEvt, () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/**
 * Window height from when the keyboard was last closed.
 * Frozen while the keyboard is open so a bottom sheet is never 75% of a
 * resized (keyboard-sized) window.
 */
export function useClosedWindowHeight() {
  const [height, setHeight] = useState(() => Dimensions.get('window').height);
  const openRef = useRef(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => {
      openRef.current = true;
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      openRef.current = false;
      setHeight(Dimensions.get('window').height);
    });
    const dim = Dimensions.addEventListener('change', ({ window }: { window: ScaledSize }) => {
      if (!openRef.current) setHeight(window.height);
    });
    return () => {
      show.remove();
      hide.remove();
      dim.remove();
    };
  }, []);
  return height;
}

function scrollFocusedInputIntoView(scrollRef: any) {
  if (!scrollRef) return;
  const input = TextInput.State.currentlyFocusedInput?.();
  if (!input || typeof input.measureLayout !== 'function') return;
  // Fabric requires a native host instance, not a numeric node handle from
  // findNodeHandle (that throws "ref.measureLayout must be called with a ref
  // to a native component").
  const nativeScroll =
    typeof scrollRef.getNativeScrollRef === 'function' ? scrollRef.getNativeScrollRef() : scrollRef;
  if (!nativeScroll || typeof nativeScroll === 'number') return;
  try {
    input.measureLayout(
      nativeScroll,
      (_x: number, y: number) => {
        scrollRef.scrollTo({ y: Math.max(0, y - 16), animated: true });
      },
      () => undefined
    );
  } catch {
    // Non-native parent (animated wrapper) — skip scroll adjustment.
  }
}

/**
 * Shared keyboard avoidance for screens and modals.
 * iOS: KeyboardAvoidingView padding + header offset only.
 * Android: remaining IME overlap as padding (KAV disabled — Expo Go / edge-to-edge).
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
  const { overlap, keyboardHeight, screenY, windowH, shrunk, bottomInset } = useKeyboardInset();
  const headerHeight = useContext(HeaderHeightContext);
  const scrollRef = useRef<any>(null);
  const wrapRef = useRef<any>(null);
  const anchorRef = useRef<NativeView | null>(null);
  const [extraPad, setExtraPad] = useState(0);
  const enableKav = Platform.OS === 'ios' && variant !== 'modal';
  const lift = Platform.OS === 'android' || variant === 'modal' ? overlap : 0;
  const composerPad = lift > 0 ? lift + COMPOSER_GAP + extraPad : extraPad;
  const formPad = lift > 0 ? lift + FORM_EXTRA_PAD : bottomGap;

  useEffect(() => {
    if (!scroll) return undefined;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => scrollFocusedInputIntoView(scrollRef.current));
    });
    return () => sub.remove();
  }, [scroll]);

  useEffect(() => {
    if (lift <= 0) setExtraPad(0);
  }, [lift]);

  const correctComposerPad = useCallback(() => {
    if (scroll || keyboardHeight <= 0 || Platform.OS !== 'android') return;
    const node = anchorRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const bottom = Math.round(y + h);
      const kbTop = screenY > 0 ? screenY : windowH - keyboardHeight;
      const target = kbTop - COMPOSER_GAP;
      const still = Math.round(bottom - target);
      if (Math.abs(still) < 2) return;
      setExtraPad((prev) => Math.max(0, prev + still));
      // TEMP DEBUG — remove after Android keyboard inset is confirmed
      console.log('[TEMP DEBUG] KeyboardSafeScreen measure', {
        variant,
        bottom,
        kbTop,
        target,
        still,
        overlap,
        keyboardHeight,
        screenY,
        windowH,
        screenH: Math.round(Dimensions.get('screen').height),
        shrunk,
        bottomInset,
      });
    });
  }, [scroll, keyboardHeight, screenY, windowH, overlap, variant, shrunk, bottomInset]);

  const register = useCallback((node: NativeView | null) => {
    anchorRef.current = node;
  }, []);

  const anchorApi = useMemo(
    () => ({ register, onAnchorLayout: correctComposerPad }),
    [register, correctComposerPad]
  );

  return (
    <ComposerAnchorContext.Provider value={anchorApi}>
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        enabled={enableKav}
        behavior={enableKav ? behavior || 'padding' : undefined}
        keyboardVerticalOffset={enableKav ? offset : 0}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: formPad },
              contentContainerStyle,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={showsVerticalScrollIndicator}
            automaticallyAdjustKeyboardInsets={false}>
            {children}
          </ScrollView>
        ) : (
          <View
            ref={wrapRef}
            onLayout={correctComposerPad}
            style={[styles.flex, composerPad > 0 ? { paddingBottom: composerPad } : null]}>
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </ComposerAnchorContext.Provider>
  );
}

/** Wrap a chat input row so remaining keyboard overlap can be measured and corrected. */
export const KeyboardBottomAnchor = forwardRef<any, { children?: ReactNode; style?: StyleProp<ViewStyle> }>(
  function KeyboardBottomAnchor({ children, style }, ref) {
    const ctx = useContext(ComposerAnchorContext);
    return (
      <View
        ref={(node) => {
          ctx?.register(node as NativeView | null);
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        collapsable={false}
        style={style}
        onLayout={() => ctx?.onAnchorLayout()}>
        {children}
      </View>
    );
  }
);

/**
 * Full-screen modal overlay: card stays between the status bar and the keyboard.
 * Keyboard space is subtracted only as overlay padding (once). Do not wrap in
 * KeyboardSafeScreen. Do not give the card a computed pixel maxHeight.
 */
export function KeyboardModalFrame({
  children,
  style,
  onBackdropPress,
  scrollChildren = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onBackdropPress?: () => void;
  /** False for full-height sheets that already scroll internally. */
  scrollChildren?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const lift = useModalKeyboardLift();
  const { overlap, windowH, keyboardHeight, screenY, shrunk, bottomInset } = useKeyboardInset();
  const overlayRef = useRef<View>(null);
  const padTop = insets.top + 12;
  const closedPad = insets.bottom + 12;
  const [padBottom, setPadBottom] = useState(closedPad);

  const applyOverlayPad = useCallback(() => {
    if (keyboardHeight <= 0) {
      setPadBottom(closedPad);
      return;
    }
    const node = overlayRef.current;
    const fallback = () => {
      // Remaining coverage of this window only — never pad the full IME if
      // the overlay already shrank with the activity.
      const remaining = Math.max(overlap, 0);
      setPadBottom(remaining + 12);
    };
    if (!node || typeof node.measureInWindow !== 'function') {
      fallback();
      return;
    }
    node.measureInWindow((_x, y, _w, h) => {
      const overlayBottom = Math.round(y + h);
      const screenH = Math.round(Dimensions.get('screen').height);
      const kbTop = screenY > 0 ? screenY : Math.max(0, screenH - lift);
      const needed = Math.max(0, overlayBottom - kbTop);
      setPadBottom(needed + 12);
    });
  }, [keyboardHeight, screenY, overlap, lift, closedPad]);

  useEffect(() => {
    applyOverlayPad();
  }, [applyOverlayPad]);

  useEffect(() => {
    if (keyboardHeight <= 0) return;
    // TEMP DEBUG — remove after Create Session modal sits above Gboard
    console.log('[TEMP DEBUG] KeyboardModalFrame', {
      windowH,
      screenH: Math.round(Dimensions.get('screen').height),
      keyboardHeight,
      screenY,
      topInset: insets.top,
      bottomInset,
      padTop,
      padBottom,
      cardMaxHeight: '100% (no pixel maxHeight)',
      overlap,
      lift,
      shrunk,
    });
  }, [
    keyboardHeight,
    windowH,
    screenY,
    insets.top,
    bottomInset,
    padTop,
    padBottom,
    overlap,
    lift,
    shrunk,
  ]);

  return (
    <View
      ref={overlayRef}
      collapsable={false}
      onLayout={applyOverlayPad}
      style={[
        styles.flex,
        {
          justifyContent: scrollChildren ? 'center' : 'flex-start',
          alignItems: 'center',
          paddingTop: padTop,
          paddingBottom: padBottom,
        },
        style,
      ]}>
      {onBackdropPress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onBackdropPress}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      ) : null}
      <View
        pointerEvents="box-none"
        style={scrollChildren ? styles.modalSlot : styles.modalSheet}>
        {children}
      </View>
    </View>
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
  automaticallyAdjustKeyboardInsets: false,
};

export const KEYBOARD_BOTTOM_GAP = BOTTOM_GAP;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  modalSlot: {
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    zIndex: 1,
  },
  modalSheet: {
    width: '100%',
    flex: 1,
    maxHeight: '100%',
    zIndex: 1,
  },
});
