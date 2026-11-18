import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { memo, type ReactNode, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { showToast } from '@/components/feedback';
import { ALLOWED_MIME_TYPES, isAllowedResourceFile } from '@/constants/resourceAllowlist';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { parseSafeHttpUrl, shareChatResourceLink, uploadChatResourceFile } from '@/lib/liveChatResources';

type Props = {
  chatId: string;
  disabled?: boolean;
  children: ReactNode;
};

function HostChatAttachBarInner({ chatId, disabled, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [sharing, setSharing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const uploading = progress != null && progress < 100;

  const pickFile = async () => {
    setMenuOpen(false);
    if (uploading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...ALLOWED_MIME_TYPES, 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const check = isAllowedResourceFile(asset.name, asset.size);
      if (!check.ok) {
        setError(check.error);
        return;
      }
      setError('');
      setProgress(0);
      await uploadChatResourceFile(
        chatId,
        { uri: asset.uri, name: asset.name || 'file', type: asset.mimeType },
        (loaded, total) => {
          if (total) setProgress(Math.min(99, Math.round((loaded / total) * 100)));
        }
      );
      setProgress(100);
      setTimeout(() => setProgress(null), 500);
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const submitLink = async () => {
    const parsed = parseSafeHttpUrl(linkUrl);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSharing(true);
    setError('');
    try {
      await shareChatResourceLink(chatId, parsed.href, linkTitle.trim() || undefined);
      setLinkOpen(false);
      setLinkUrl('');
      setLinkTitle('');
      showToast({ type: 'success', title: 'Link shared' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share that link');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View>
      <View style={styles.pill}>
        <View>
          <Pressable
            onPress={() => !disabled && !uploading && setMenuOpen((open) => !open)}
            disabled={disabled || uploading}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Attach"
            style={[styles.clipBtn, (disabled || uploading) && styles.disabled]}>
            <Ionicons name="attach-outline" size={20} color="#6D415F" />
          </Pressable>
          {menuOpen ? (
            <View style={styles.menu}>
              <Pressable style={styles.menuItem} onPress={pickFile}>
                <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
                <Text style={styles.menuLabel}>Upload file</Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setLinkOpen(true);
                }}>
                <Ionicons name="link-outline" size={16} color={COLORS.primary} />
                <Text style={styles.menuLabel}>Share link</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {children}
      </View>
      {progress != null ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setLinkOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Share a link</Text>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://"
              placeholderTextColor={COLORS.inkSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.input}
            />
            <TextInput
              value={linkTitle}
              onChangeText={setLinkTitle}
              placeholder="Title (optional)"
              placeholderTextColor={COLORS.inkSecondary}
              style={styles.input}
            />
            <View style={styles.sheetRow}>
              <Pressable style={styles.cancel} onPress={() => setLinkOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.share, (!linkUrl.trim() || sharing) && styles.disabled]}
                disabled={!linkUrl.trim() || sharing}
                onPress={submitLink}>
                <Text style={styles.shareText}>{sharing ? 'Sharing…' : 'Share'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export const HostChatAttachBar = memo(HostChatAttachBarInner);

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: COLORS.cream,
    paddingLeft: 4,
    paddingRight: 4,
  },
  clipBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
  menu: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    width: 168,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.15)',
    overflow: 'hidden',
    zIndex: 20,
    elevation: 4,
  },
  menuItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  menuLabel: { fontSize: 14, color: COLORS.text },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(109,65,95,0.15)',
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: { height: 4, backgroundColor: COLORS.primary },
  error: { marginTop: 6, fontSize: 12, color: '#DC2626' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING[4],
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: SPACING[4],
    gap: SPACING[2],
  },
  sheetTitle: { fontSize: 16, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.text },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: COLORS.text,
  },
  sheetRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cancel: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium },
  share: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareText: { color: COLORS.white, fontWeight: FONT_WEIGHTS.medium },
});
