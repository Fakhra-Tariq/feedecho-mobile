/**
 * Compatibility layer — prefer `@/components/feedback` (`showToast` / `showAlert`).
 * Existing `showAppAlert` callers keep working while we migrate them.
 */
import {
  FeedbackProvider,
  showAlert,
  showToast,
  type AlertOptions as FeedbackAlertOptions,
} from '@/components/feedback';

type LegacyAlertOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
};

export const AppAlertProvider = FeedbackProvider;

/** Maps legacy one-shot alerts to toast (success-ish) or card (errors / confirms). */
export function showAppAlert(options: LegacyAlertOptions) {
  const title = options.title || '';
  const message = options.message;
  const looksSuccess =
    /^(copied|finished|saved|removed|ended|session created|quiz launched|updated)/i.test(title) ||
    /success/i.test(title);

  if (options.destructive || options.cancelLabel || options.onCancel) {
    showAlert({
      type: options.destructive ? 'destructive' : 'warning',
      title,
      message,
      primary: {
        label: options.confirmLabel || (options.destructive ? 'Delete' : 'OK'),
        onPress: options.onConfirm,
      },
      secondary: {
        label: options.cancelLabel || 'Cancel',
        onPress: options.onCancel,
      },
      dismissOnBackdrop: !options.destructive,
    });
    return;
  }

  if (looksSuccess && !options.onConfirm) {
    showToast({
      type: 'success',
      title: title.replace(/!+$/, '').replace(/\bsuccessfully\b/gi, '').trim() || title,
      message: message?.replace(/!+$/, '').replace(/\bsuccessfully\b/gi, '').trim(),
    });
    return;
  }

  const alertOpts: FeedbackAlertOptions = {
    type: looksSuccess ? 'success' : 'error',
    title: title.replace(/!+$/, '').trim(),
    message: message?.replace(/!+$/, '').trim(),
    primary: {
      label: options.confirmLabel || 'Close',
      onPress: options.onConfirm,
    },
  };
  showAlert(alertOpts);
}

export function useAppAlert() {
  return { showAlert: showAppAlert, showToast };
}
