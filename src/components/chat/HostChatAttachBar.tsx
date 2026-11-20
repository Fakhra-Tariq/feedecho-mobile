import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ALLOWED_MIME_TYPES,
  fileExtensionOf,
  formatFileSize,
  isAllowedResourceFile,
} from '@/constants/resourceAllowlist';
import { COLORS } from '@/constants/theme';

export type PendingAttachment = {
  uri: string;
  name: string;
  type?: string;
  size?: number;
  isImage: boolean;
};

type BarProps = {
  disabled?: boolean;
  onPicked: (file: PendingAttachment) => void;
  onError: (message: string) => void;
};

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

async function fileSizeOf(uri: string, reported?: number | null) {
  if (typeof reported === 'number' && reported >= 0) return reported;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {
    // The server checks size again.
  }
  return undefined;
}

function HostChatAttachBarInner({ disabled, onPicked, onError }: BarProps) {
  const pickFile = async () => {
    if (disabled) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_MIME_TYPES, 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name || 'file';
      const size = await fileSizeOf(asset.uri, asset.size);
      const check = isAllowedResourceFile(name, size);
      if (!check.ok) {
        onError(check.error);
        return;
      }
      const ext = fileExtensionOf(name);
      const mime = asset.mimeType || '';
      onPicked({
        uri: asset.uri,
        name,
        type: mime || undefined,
        size,
        isImage: IMAGE_EXT.has(ext) || mime.startsWith('image/'),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not open that file.');
    }
  };

  return (
    <Pressable
      onPress={pickFile}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Attach"
      style={[styles.clipBtn, disabled && styles.disabled]}>
      <Ionicons name="attach-outline" size={20} color="#6D415F" />
    </Pressable>
  );
}

export const HostChatAttachBar = memo(HostChatAttachBarInner);

function PendingAttachmentPreviewInner({
  file,
  progress,
  busy,
  onRemove,
}: {
  file: PendingAttachment;
  progress: number | null;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <View style={styles.preview}>
      {file.isImage ? (
        <Image source={{ uri: file.uri }} style={styles.thumb} />
      ) : (
        <View style={styles.fileIcon}>
          <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
        </View>
      )}
      <View style={styles.previewCopy}>
        <Text style={styles.previewName} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.previewSize}>{formatFileSize(file.size)}</Text>
        {progress != null ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onRemove}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Remove attachment"
        style={[styles.removeBtn, busy && styles.disabled]}>
        <Ionicons name="close" size={18} color="#6D415F" />
      </Pressable>
    </View>
  );
}

export const PendingAttachmentPreview = memo(PendingAttachmentPreviewInner);

const styles = StyleSheet.create({
  clipBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.15)',
    backgroundColor: COLORS.white,
    padding: 8,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F3EEF8',
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(109,65,95,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCopy: { flex: 1, minWidth: 0 },
  previewName: { fontSize: 14, color: COLORS.text },
  previewSize: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(109,65,95,0.15)',
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: 4, backgroundColor: COLORS.primary },
  removeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
