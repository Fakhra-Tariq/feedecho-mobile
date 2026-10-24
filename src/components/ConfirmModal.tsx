import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { AppButton } from '@/components/ui';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
  busy?: boolean;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  destructive = false,
  busy = false,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.iconWrap, destructive && styles.iconDanger]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={26}
              color={destructive ? COLORS.danger : COLORS.primary}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.row}>
            <AppButton
              label="Cancel"
              variant="secondary"
              onPress={onCancel}
              disabled={busy}
              style={styles.flex}
            />
            <AppButton
              label={busy ? 'Please wait…' : confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              disabled={busy}
              loading={busy}
              style={styles.flex}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING[6],
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[6],
    ...SHADOWS.raised,
  },
  iconWrap: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  iconDanger: { backgroundColor: COLORS.dangerSoft },
  title: {
    ...TYPE.bodyStrong,
    fontSize: 20,
    textAlign: 'center',
  },
  message: {
    marginTop: SPACING[2],
    marginBottom: SPACING[5],
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING[3],
  },
  flex: { flex: 1 },
});
