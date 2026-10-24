import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SHADOWS } from '@/constants/theme';

export type ToastOptions = {
  type?: 'success' | 'info';
  title: string;
  message?: string;
};

export type AlertButton = {
  label: string;
  onPress?: () => void;
};

export type AlertOptions = {
  type?: 'error' | 'warning' | 'success' | 'destructive';
  title: string;
  message?: string;
  primary?: AlertButton;
  secondary?: AlertButton;
  /** Default true for non-destructive; false for destructive confirmations */
  dismissOnBackdrop?: boolean;
};

type FeedbackContextValue = {
  showToast: (options: ToastOptions) => void;
  showAlert: (options: AlertOptions) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

let externalToast: ((options: ToastOptions) => void) | null = null;
let externalAlert: ((options: AlertOptions) => void) | null = null;

export function showToast(options: ToastOptions) {
  if (externalToast) {
    externalToast(options);
    return;
  }
  if (typeof alert === 'function') alert(`${options.title}\n${options.message || ''}`);
}

export function showAlert(options: AlertOptions) {
  if (externalAlert) {
    externalAlert(options);
    return;
  }
  if (typeof alert === 'function') alert(`${options.title}\n${options.message || ''}`);
}

const TOAST_MS = 2800;
const INFO_TOAST_MS = 3000;
/** Native stack/tab header content height (below the status bar). */
const HEADER_HEIGHT = 56;
const TOAST_GAP = 8;

export function FeedbackProvider({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [alertOpts, setAlertOpts] = useState<AlertOptions | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    Animated.timing(toastAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [toastAnim]);

  const showToastFn = useCallback(
    (next: ToastOptions) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(next);
      setToastKey((k) => k + 1);
      toastAnim.setValue(0);
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
      toastTimer.current = setTimeout(
        hideToast,
        next.type === 'info' ? INFO_TOAST_MS : TOAST_MS
      );
    },
    [hideToast, toastAnim]
  );

  const showAlertFn = useCallback((next: AlertOptions) => {
    setAlertOpts(next);
  }, []);

  externalToast = showToastFn;
  externalAlert = showAlertFn;

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const closeAlert = useCallback((run?: () => void) => {
    setAlertOpts(null);
    run?.();
  }, []);

  const value = useMemo(
    () => ({ showToast: showToastFn, showAlert: showAlertFn }),
    [showToastFn, showAlertFn]
  );

  const dismissOnBackdrop =
    alertOpts?.dismissOnBackdrop ?? alertOpts?.type !== 'destructive';

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
        onPanResponderRelease: (_, g) => {
          if (g.dy < -24 || g.vy < -0.4) hideToast();
        },
      }),
    [hideToast]
  );

  const alertVisual = getAlertVisual(alertOpts?.type || 'error');

  const toastTop = insets.top + HEADER_HEIGHT + TOAST_GAP;

  return (
    <FeedbackContext.Provider value={value}>
      <View style={styles.root}>
      {children}

      {/* Toast — last child, top-aligned, box-none so content behind stays tappable */}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.toastLayer, { top: toastTop }]}
          key={toastKey}>
          <Animated.View
            accessibilityLiveRegion="polite"
            {...panResponder.panHandlers}
            style={[
              styles.toastCard,
              toast.type === 'info' && styles.toastCardInfo,
              {
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-24, 0],
                    }),
                  },
                ],
              },
            ]}>
            <View
              style={[
                styles.toastIcon,
                toast.type === 'info' ? styles.toastIconInfo : styles.toastIconSuccess,
              ]}>
              <Ionicons
                name={toast.type === 'info' ? 'information' : 'checkmark'}
                size={toast.type === 'info' ? 12 : 18}
                color={COLORS.white}
              />
            </View>
            <View style={styles.toastCopy}>
              <Text
                style={[styles.toastTitle, toast.type === 'info' && styles.toastTitleInfo]}
                numberOfLines={toast.type === 'info' ? 4 : 2}>
                {toast.title}
              </Text>
              {toast.message ? (
                <Text
                  style={[styles.toastMessage, toast.type === 'info' && styles.toastMessageInfo]}
                  numberOfLines={3}>
                  {toast.message}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={hideToast}
              hitSlop={8}
              style={styles.toastDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss">
              <Ionicons
                name="close"
                size={18}
                color={toast.type === 'info' ? COLORS.white : '#8A7F89'}
              />
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      <Modal
        visible={Boolean(alertOpts)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() =>
          closeAlert(alertOpts?.secondary?.onPress || alertOpts?.primary?.onPress)
        }>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (dismissOnBackdrop) closeAlert(alertOpts?.secondary?.onPress);
          }}
          accessibilityRole="button"
          accessibilityLabel="Close dialog">
          <Pressable
            style={styles.alertCard}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal>
            <View style={[styles.alertIcon, { backgroundColor: alertVisual.bg }]}>
              <Ionicons name={alertVisual.icon} size={28} color={alertVisual.color} />
            </View>
            <Text style={styles.alertTitle}>{alertOpts?.title}</Text>
            {alertOpts?.message ? (
              <Text style={styles.alertMessage}>{alertOpts.message}</Text>
            ) : (
              <View style={{ height: 16 }} />
            )}
            <View style={styles.alertActions}>
              {alertOpts?.primary ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btnPrimary,
                    alertOpts.type === 'destructive' && styles.btnDanger,
                    pressed &&
                      (alertOpts.type === 'destructive'
                        ? styles.btnDangerPressed
                        : styles.btnPrimaryPressed),
                  ]}
                  onPress={() => closeAlert(alertOpts.primary?.onPress)}
                  accessibilityRole="button"
                  accessibilityLabel={alertOpts.primary.label}>
                  <Text style={styles.btnPrimaryLabel}>{alertOpts.primary.label}</Text>
                </Pressable>
              ) : null}
              {alertOpts?.secondary ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btnSecondary,
                    pressed && styles.btnSecondaryPressed,
                  ]}
                  onPress={() => closeAlert(alertOpts.secondary?.onPress)}
                  accessibilityRole="button"
                  accessibilityLabel={alertOpts.secondary.label}>
                  <Text style={styles.btnSecondaryLabel}>{alertOpts.secondary.label}</Text>
                </Pressable>
              ) : null}
              {!alertOpts?.primary && !alertOpts?.secondary ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.btnPrimary,
                    pressed && styles.btnPrimaryPressed,
                  ]}
                  onPress={() => closeAlert()}
                  accessibilityRole="button"
                  accessibilityLabel="Close">
                  <Text style={styles.btnPrimaryLabel}>Close</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    return { showToast, showAlert };
  }
  return ctx;
}

function getAlertVisual(type: NonNullable<AlertOptions['type']>) {
  switch (type) {
    case 'warning':
      return {
        bg: '#FEF3C7',
        color: '#B45309',
        icon: 'warning' as const,
      };
    case 'success':
      return {
        bg: '#DCFCE7',
        color: '#15803D',
        icon: 'checkmark-circle' as const,
      };
    case 'destructive':
      return {
        bg: '#FEE2E2',
        color: '#B3261E',
        icon: 'trash-outline' as const,
      };
    case 'error':
    default:
      return {
        bg: '#FEE2E2',
        color: '#B3261E',
        icon: 'alert-circle' as const,
      };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toastLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'stretch',
  },
  toastCard: {
    marginHorizontal: 16,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...SHADOWS.raised,
    elevation: 4,
  },
  toastCardInfo: {
    backgroundColor: '#6B3A5C',
    borderColor: '#6B3A5C',
  },
  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconSuccess: { backgroundColor: '#22C55E' },
  toastIconInfo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.white,
  },
  toastCopy: { flex: 1, minWidth: 0 },
  toastTitle: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  toastTitleInfo: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.white,
    lineHeight: 18,
  },
  toastMessage: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F5460',
    lineHeight: 16,
  },
  toastMessageInfo: {
    color: COLORS.white,
    fontSize: 13,
    lineHeight: 18,
  },
  toastDismiss: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  alertIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 13,
    color: '#5F5460',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  alertActions: {
    width: '100%',
    gap: 8,
  },
  btnPrimary: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#6B3A5C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnPrimaryPressed: { backgroundColor: '#5A2F4D' },
  btnPrimaryLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  btnDanger: { backgroundColor: '#EF4444' },
  btnDangerPressed: { backgroundColor: '#DC2626' },
  btnSecondary: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#F1E4EC',
    borderWidth: 1,
    borderColor: '#6B3A5C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnSecondaryPressed: { backgroundColor: '#E6D2DF' },
  btnSecondaryLabel: {
    color: '#4A1F3D',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
