import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardModalFrame } from '@/components/KeyboardSafeScreen';
import { AppButton } from '@/components/ui';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting?: boolean;
};

export function CreateSessionModal({
  visible,
  title,
  value,
  onChangeText,
  onCancel,
  onSubmit,
  submitting = false,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardModalFrame style={styles.overlay} onBackdropPress={onCancel}>
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          onLayout={(e) => {
            // TEMP DEBUG — remove after Create Session modal sits above Gboard
            console.log('[TEMP DEBUG] CreateSessionModal card onLayout', {
              height: Math.round(e.nativeEvent.layout.height),
              width: Math.round(e.nativeEvent.layout.width),
              y: Math.round(e.nativeEvent.layout.y),
            });
          }}>
          <View style={styles.iconWrap}>
            <Ionicons name="calendar-outline" size={26} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={styles.fields}
            contentContainerStyle={styles.fieldsContent}>
            <Text style={styles.label}>Session Name</Text>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder="Enter session name"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
              autoFocus
            />
          </ScrollView>
          <View style={styles.row}>
            <AppButton
              label="Cancel"
              variant="secondary"
              onPress={onCancel}
              disabled={submitting}
              style={styles.flex}
            />
            <AppButton
              label={submitting ? 'Creating…' : 'Create Session'}
              onPress={onSubmit}
              disabled={submitting}
              loading={submitting}
              style={styles.flex}
            />
          </View>
        </Pressable>
      </KeyboardModalFrame>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    paddingHorizontal: SPACING[6],
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    alignSelf: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[6],
    flexShrink: 1,
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
  title: {
    ...TYPE.bodyStrong,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  fields: {
    flexShrink: 1,
    minHeight: 0,
  },
  fieldsContent: {
    flexGrow: 0,
  },
  label: {
    ...TYPE.label,
    marginBottom: SPACING[2],
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    minHeight: 48,
    paddingHorizontal: SPACING[4],
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
    marginBottom: SPACING[5],
  },
  row: {
    flexDirection: 'row',
    gap: SPACING[3],
  },
  flex: { flex: 1 },
});
