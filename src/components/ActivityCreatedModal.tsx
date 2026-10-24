import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  code: string;
  onClose: () => void;
};

/**
 * Shared post-launch success modal for Chat / Quiz / Space Race / Exit Ticket.
 * UI-only — callers supply the existing access/join code unchanged.
 */
export function ActivityCreatedModal({ visible, title, code, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
    } catch {
      // Keep modal open; label stays as Copy Code
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={32} color={COLORS.white} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Share this code with audience</Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Audience Access Code</Text>
            <Text
              style={styles.codeValue}
              selectable
              accessibilityRole="text"
              accessibilityLabel={`Audience access code ${code}`}>
              {code}
            </Text>
          </View>

          <Pressable
            style={styles.copyBtn}
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel="Copy code">
            <Ionicons name="copy-outline" size={18} color={COLORS.white} />
            <Text style={styles.copyLabel}>{copied ? 'Copied!' : 'Copy Code'}</Text>
          </Pressable>

          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[6],
  },
  card: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.plum,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: '#5F5460',
    textAlign: 'center',
  },
  codeBox: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 12,
    color: '#5F5460',
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 3,
    color: '#1F2937',
    textAlign: 'center',
  },
  copyBtn: {
    marginTop: 20,
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6B3A5C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
  },
  closeBtn: {
    marginTop: 8,
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    color: '#2B1F27',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
