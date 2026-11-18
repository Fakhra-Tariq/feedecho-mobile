import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { formatFileSize } from '@/constants/resourceAllowlist';
import type { ChatMessage } from '@/lib/anonymousChat';

type Props = {
  message: ChatMessage;
  onDownload?: (message: ChatMessage) => Promise<void> | void;
  isGuest?: boolean;
};

function iconFor(message: ChatMessage): keyof typeof Ionicons.glyphMap {
  const kind = String(message.resourceKind || '');
  const name = String(message.fileName || '').toLowerCase();
  if (kind === 'link') return 'link-outline';
  if (kind === 'image' || /\.(png|jpe?g|webp)$/.test(name)) return 'image-outline';
  if (name.endsWith('.pdf')) return 'document-text-outline';
  return 'document-outline';
}

function ChatResourceCardInner({ message, onDownload, isGuest }: Props) {
  const [busy, setBusy] = useState(false);
  const isLink = message.resourceKind === 'link';
  const title = isLink
    ? message.linkTitle || message.linkDomain || 'Shared link'
    : message.fileName || 'Shared file';
  const meta = isLink ? message.linkDomain || '' : formatFileSize(message.fileSize) || 'File';

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDownload?.(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={iconFor(message)} size={18} color={COLORS.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={isLink ? 'Open' : 'Download'}>
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Ionicons name={isLink ? 'open-outline' : 'download-outline'} size={14} color={COLORS.white} />
        )}
        <Text style={styles.btnLabel}>
          {busy ? (isLink ? 'Opening…' : 'Downloading…') : isLink ? 'Open' : isGuest ? 'Download' : 'Download'}
        </Text>
      </Pressable>
    </View>
  );
}

export const ChatResourceCard = memo(ChatResourceCardInner);

const styles = StyleSheet.create({
  card: {
    minWidth: 200,
    maxWidth: 280,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.15)',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING[3],
    gap: SPACING[2],
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING[2] },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(109,65,95,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.text },
  meta: { fontSize: 11, color: COLORS.darkTextSecondary, marginTop: 2 },
  btn: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnLabel: { color: COLORS.white, fontSize: 12, fontWeight: FONT_WEIGHTS.medium },
});
