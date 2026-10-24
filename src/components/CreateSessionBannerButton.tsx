import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { showToast } from '@/components/feedback';
import { FONT_WEIGHTS } from '@/constants/theme';

export const ACTIVE_SESSION_CREATE_TOAST =
  'Only one session can be active at a time. End your current session to create a new one.';

export function showActiveSessionCreateToast() {
  showToast({
    type: 'info',
    title: ACTIVE_SESSION_CREATE_TOAST,
  });
}

type Props = {
  hasActiveSession: boolean;
  onCreate: () => void;
};

/**
 * Plum-banner Create Session control used on Explore and Sessions.
 * Stays pressable when a session is already active so the info toast can fire.
 */
export function CreateSessionBannerButton({ hasActiveSession, onCreate }: Props) {
  return (
    <Pressable
      onPress={() => {
        if (hasActiveSession) {
          showActiveSessionCreateToast();
          return;
        }
        onCreate();
      }}
      style={({ pressed }) => [
        styles.createButton,
        hasActiveSession ? styles.createButtonBusy : styles.createButtonEnabled,
        pressed &&
          (hasActiveSession ? styles.createButtonBusyPressed : styles.createButtonPressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel="Create session"
      accessibilityHint={hasActiveSession ? 'Only one session can be active at a time' : undefined}>
      <Ionicons name="add" size={18} color="#6B3A5C" />
      <Text style={styles.createButtonLabel}>Create Session</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  createButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  createButtonEnabled: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  createButtonBusy: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  createButtonBusyPressed: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  createButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  createButtonLabel: {
    color: '#6B3A5C',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
