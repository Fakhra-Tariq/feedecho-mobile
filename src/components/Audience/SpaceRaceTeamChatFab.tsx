import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAwareBottomSheet } from '@/components/KeyboardAwareBottomSheet';
import { useKeyboardIsOpen } from '@/components/KeyboardSafeScreen';
import { showAlert, showToast } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  estimateDataUrlBytes,
  formatChatFileSize,
  MAX_CHAT_ATTACHMENT_BYTES,
  pickTeamChatDocument,
} from '@/lib/chatFileTransfer';
import { DOWNLOAD_FAILED_MESSAGE, downloadAndOpenFile } from '@/lib/downloadAndOpenFile';
import {
  fileToDataUrl,
  guessDocumentMime,
  prepareChatImage,
} from '@/lib/compressChatImage';
import { getTeamChatMessages, sendTeamChatMessage } from '@/lib/hostSpaceRaces';
import {
  pickGalleryImage,
  showMediaPermissionAlert,
  type PickedChatImage,
} from '@/lib/pickChatImage';
import { useRtdbList } from '@/lib/useRtdb';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
const NEAR_BOTTOM_PX = 80;

const isAllowedImage = (name?: string, mime?: string) => {
  const type = String(mime || '').toLowerCase();
  if (type.startsWith('video/') || type === 'image/svg+xml') return false;
  if (IMAGE_EXT.test(name || '')) return true;
  return type.startsWith('image/');
};

function chatUploadErrorMessage(error: unknown) {
  const err = error as { code?: string; message?: string; status?: number };
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  const combined = `${code} ${msg}`.toLowerCase();
  if (err?.status === 413 || /too large|maximum size|payload too large/i.test(combined)) {
    return 'File too large. Maximum size is 100MB for chat.';
  }
  if (/storage\/unauthorized|permission-denied|not allowed|unauthorized/i.test(combined)) {
    return 'Not allowed';
  }
  if (/network request failed|network error|failed to fetch|timeout/i.test(combined)) {
    return 'Network error. Check your connection and retry.';
  }
  if (/failed to read|could not read|enoent|file not found|uri/i.test(combined)) {
    return 'Could not read the selected file.';
  }
  return cleanErrorMessage(error, 'Failed to upload file');
}

const detectMessageType = (text: string) => {
  const match = text.match(URL_REGEX);
  if (match && match[0]) return { type: 'link' as const, url: match[0], text };
  return { type: 'text' as const, url: '', text };
};

const formatTime = (timestamp?: string) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const messageKey = (msg: any) =>
  msg?.id || `${msg?.timestamp || ''}-${msg?.participantId || ''}-${msg?.text || ''}`;

const sortMessages = (items: any[]) =>
  [...items].sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

const mergeMessages = (...groups: any[][]) => {
  const byId = new Map<string, any>();
  groups.flat().forEach((msg) => {
    if (!msg) return;
    const key = messageKey(msg);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, msg);
      return;
    }
    byId.set(key, {
      ...existing,
      ...msg,
      participantId: msg.participantId || existing.participantId,
      senderName: msg.senderName || existing.senderName,
    });
  });
  return sortMessages(Array.from(byId.values()));
};

function ChatBubbleImage({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed || !uri) {
    return (
      <View style={[styles.bubbleImage, styles.bubbleImageFallback]}>
        <Ionicons name="image-outline" size={22} color={COLORS.inkSecondary} />
      </View>
    );
  }
  return (
    <View style={styles.bubbleImage}>
      {!loaded ? (
        <View style={[StyleSheet.absoluteFill, styles.bubbleImageFallback]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : null}
      <Image
        source={{ uri }}
        style={styles.bubbleImage}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

type PendingFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
  previewUrl?: string;
  kind: 'image' | 'file';
};

type Props = {
  raceId: string | null;
  teamId: number | string | null | undefined;
  participant: { id?: string; name?: string } | null;
};

export function SpaceRaceTeamChatFab({ raceId, teamId, participant }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardIsOpen();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [apiMessages, setApiMessages] = useState<any[]>([]);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [pendingAttachment, setPendingAttachment] = useState<PendingFile | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<FlatList>(null);
  const nearBottomRef = useRef(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastMessageCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const forceScrollRef = useRef(false);
  const attachmentArmedRef = useRef(false);
  const uploadFilesRef = useRef(new Map<string, PendingFile & { caption: string; running: boolean }>());
  const lastSeenTimestampRef = useRef<string | null>(null);
  const unreadHydratedRef = useRef(false);
  const pickingImageRef = useRef(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const normalizedTeamId = teamId != null && teamId !== '' ? String(teamId) : null;
  const chatPath =
    raceId && normalizedTeamId != null
      ? `space_race_team_messages/${raceId}/team_${normalizedTeamId}`
      : null;

  const { list: rtdbMessages, loading: rtdbLoading, error: rtdbError } = useRtdbList(chatPath, {
    enabled: Boolean(chatPath),
    sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
  });

  const useApiFallback = Boolean(chatPath) && Boolean(rtdbError);

  const fetchMessagesFromApi = useCallback(async () => {
    if (!raceId || normalizedTeamId == null) return;
    try {
      const response = await getTeamChatMessages(raceId, normalizedTeamId);
      if (response.success) setApiMessages(response.data || []);
    } catch {
      // fallback best-effort
    }
  }, [raceId, normalizedTeamId]);

  useEffect(() => {
    if (!useApiFallback) {
      setApiMessages([]);
      return undefined;
    }
    fetchMessagesFromApi();
    const interval = setInterval(fetchMessagesFromApi, 2000);
    return () => clearInterval(interval);
  }, [fetchMessagesFromApi, useApiFallback]);

  const messages = useMemo(
    () => mergeMessages(rtdbMessages, apiMessages, pendingMessages),
    [rtdbMessages, apiMessages, pendingMessages]
  );

  const currentParticipantId = participant?.id ? String(participant.id) : '';
  const uploading = pendingMessages.some((m) => m.uploadState === 'uploading');
  const composerBusy = isSending || uploading;

  useEffect(() => {
    didInitialScrollRef.current = false;
    lastMessageIdRef.current = null;
    lastMessageCountRef.current = 0;
    nearBottomRef.current = true;
    forceScrollRef.current = false;
  }, [chatPath]);

  const scrollToBottom = useCallback((animated = false) => {
    const list = listRef.current;
    if (!list) return;
    requestAnimationFrame(() => {
      try {
        list.scrollToEnd({ animated });
      } catch {
        // FlatList may not be measured yet; later layout/content-size retries.
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    nearBottomRef.current = true;
    didInitialScrollRef.current = false;
    const timers = [50, 160, 320].map((ms) =>
      setTimeout(() => {
        nearBottomRef.current = true;
        didInitialScrollRef.current = true;
        scrollToBottom(false);
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [open, scrollToBottom]);

  useEffect(() => {
    if (!open || !keyboardOpen) return;
    requestAnimationFrame(() => scrollToBottom(true));
  }, [keyboardOpen, open, scrollToBottom]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastId = last ? messageKey(last) : null;
    const previousId = lastMessageIdRef.current;
    const previousCount = lastMessageCountRef.current;
    const hasNewTail =
      messages.length !== previousCount || (Boolean(lastId) && lastId !== previousId);
    lastMessageIdRef.current = lastId;
    lastMessageCountRef.current = messages.length;

    const sentByMe = forceScrollRef.current;

    if (!open) return;
    if (!didInitialScrollRef.current) {
      if (rtdbLoading && messages.length === 0) {
        return;
      }
      didInitialScrollRef.current = true;
      nearBottomRef.current = true;
      scrollToBottom(false);
      return;
    }

    if (!hasNewTail && !sentByMe) return;
    if (!sentByMe && !nearBottomRef.current) return;
    if (sentByMe) nearBottomRef.current = true;
    scrollToBottom(false);
  }, [messages, rtdbLoading, open, scrollToBottom]);

  useEffect(() => {
    const latestTimestamp = messages[messages.length - 1]?.timestamp || '';
    if (!unreadHydratedRef.current) {
      lastSeenTimestampRef.current = latestTimestamp;
      if (messages.length > 0 || !rtdbLoading) {
        unreadHydratedRef.current = true;
        setUnreadCount(0);
      }
      return;
    }
    if (open) {
      lastSeenTimestampRef.current = latestTimestamp || lastSeenTimestampRef.current;
      setUnreadCount(0);
      return;
    }
    const lastSeen = lastSeenTimestampRef.current;
    const unseen = messages.filter((msg) => {
      if (String(msg.participantId || '') === currentParticipantId) return false;
      return String(msg.timestamp || '') > String(lastSeen);
    }).length;
    setUnreadCount(unseen);
  }, [messages, open, currentParticipantId, rtdbLoading]);

  const patchPending = (id: string, patch: Record<string, unknown>) => {
    setPendingMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const sendMessagePayload = async (
    payload: Record<string, unknown>,
    optimisticId: string | null = null,
    options: {
      keepOnFailure?: boolean;
      trackComposer?: boolean;
      onUploadProgress?: (ratio: number) => void;
    } = {}
  ) => {
    const { keepOnFailure = false, trackComposer = true, onUploadProgress } = options;
    if (!raceId || normalizedTeamId == null || !participant?.id) {
      showToast({ type: 'info', title: 'Cannot send message - missing required information' });
      return null;
    }
    const dropOptimistic = () => {
      if (!optimisticId || keepOnFailure) return;
      setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    };
    try {
      if (trackComposer) setIsSending(true);
      const response = await sendTeamChatMessage(
        raceId,
        {
          participantId: String(participant.id),
          teamId: normalizedTeamId,
          senderName: participant.name || 'Student',
          ...payload,
          text: String(payload.text ?? ''),
        },
        onUploadProgress
      );
      if (response.success) {
        if (optimisticId) {
          setPendingMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        if (useApiFallback && response.data) {
          setApiMessages((prev) => mergeMessages(prev, [response.data]));
          fetchMessagesFromApi();
        }
        return response.data;
      }
      dropOptimistic();
      showToast({ type: 'info', title: response.error || 'Failed to send message' });
      return null;
    } catch (error) {
      dropOptimistic();
      showAlert({
        type: 'error',
        title: 'Chat failed',
        message: cleanErrorMessage(error, 'Failed to send message'),
        primary: { label: 'Close' },
      });
      return null;
    } finally {
      if (trackComposer) setIsSending(false);
    }
  };

  const handleSendText = async () => {
    const trimmed = message.trim();
    if (!trimmed || composerBusy) return;
    const detected = detectMessageType(trimmed);
    const optimisticId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    forceScrollRef.current = true;
    setPendingMessages((prev) =>
      mergeMessages(prev, [
        {
          id: optimisticId,
          participantId: participant?.id,
          senderName: participant?.name || 'You',
          text: trimmed,
          type: detected.type,
          url: detected.url,
          linkTitle: detected.type === 'link' ? detected.url : '',
          timestamp: new Date().toISOString(),
          pending: true,
        },
      ])
    );
    setMessage('');
    await sendMessagePayload(
      {
        text: trimmed,
        type: detected.type,
        url: detected.url,
        linkTitle: detected.type === 'link' ? detected.url : '',
      },
      optimisticId
    );
  };

  const uploadAttachment = async (file: PendingFile, caption = '', existingId: string | null = null) => {
    if (!file || !raceId || normalizedTeamId == null || !participant?.id) {
      showToast({ type: 'info', title: 'Missing required information for upload' });
      return;
    }
    const captionText = String(caption || '').trim();
    const fallbackText = file.kind === 'image' ? 'Shared an image' : `Shared ${file.fileName}`;
    const messageText = captionText || fallbackText;
    const optimisticId =
      existingId || `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const inFlight = uploadFilesRef.current.get(optimisticId);
    if (existingId && inFlight?.running) return;
    uploadFilesRef.current.set(optimisticId, { ...file, caption: captionText, running: true });

    if (!existingId) {
      forceScrollRef.current = true;
      setPendingMessages((prev) =>
        mergeMessages(prev, [
          {
            id: optimisticId,
            participantId: participant.id,
            senderName: participant.name || 'You',
            text: messageText,
            type: file.kind,
            url: file.kind === 'image' ? file.previewUrl || file.uri : '',
            fileName: file.fileName,
            timestamp: new Date().toISOString(),
            pending: true,
            uploadState: 'uploading',
            uploadProgress: 0,
          },
        ])
      );
    } else {
      patchPending(optimisticId, { uploadState: 'uploading', uploadProgress: 0, pending: true });
    }

    try {
      const prepared =
        file.kind === 'image'
          ? await prepareChatImage({
              uri: file.uri,
              mimeType: file.mimeType,
              fileName: file.fileName,
              size: file.size,
              width: file.width,
              height: file.height,
            })
          : file;
      uploadFilesRef.current.set(optimisticId, {
        ...file,
        ...prepared,
        kind: file.kind,
        caption: captionText,
        running: true,
      });
      const preparedSize = prepared.size || file.size || 0;
      if (preparedSize > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error(
          `${file.kind === 'image' ? 'Image' : 'File'} too large. Maximum size is 100MB for chat.`
        );
      }
      const mimeType = guessDocumentMime(prepared.fileName || file.fileName, prepared.mimeType);
      const downloadUrl = await fileToDataUrl(
        prepared.uri,
        mimeType,
        (ratio) => {
          patchPending(optimisticId, {
            uploadState: 'uploading',
            uploadProgress: Math.round(ratio * 50),
          });
        },
        {
          maxBytes: MAX_CHAT_ATTACHMENT_BYTES,
          tooLargeMessage: `${file.kind === 'image' ? 'Image' : 'File'} too large. Maximum size is 100MB for chat.`,
        }
      );
      if (!downloadUrl || !String(downloadUrl).startsWith('data:')) {
        throw new Error('Failed to read file');
      }
      const result = await sendMessagePayload(
        {
          text: messageText,
          type: file.kind,
          url: downloadUrl,
          fileName: prepared.fileName || file.fileName,
        },
        optimisticId,
        {
          keepOnFailure: true,
          trackComposer: false,
          onUploadProgress: (ratio) => {
            patchPending(optimisticId, {
              uploadState: 'uploading',
              uploadProgress: 50 + Math.round(ratio * 50),
            });
          },
        }
      );
      if (!result) {
        patchPending(optimisticId, { uploadState: 'error', uploadProgress: null, pending: true });
        return;
      }
      uploadFilesRef.current.delete(optimisticId);
    } catch (error) {
      patchPending(optimisticId, { uploadState: 'error', uploadProgress: null, pending: true });
      showToast({
        type: 'info',
        title: chatUploadErrorMessage(error),
      });
    } finally {
      const current = uploadFilesRef.current.get(optimisticId);
      if (current) current.running = false;
    }
  };

  const retryUpload = (messageId: string) => {
    const saved = uploadFilesRef.current.get(messageId);
    if (!saved) return;
    uploadAttachment(saved, saved.caption, messageId);
  };

  const handleSendComposer = async () => {
    if (pendingAttachment) {
      if (attachmentArmedRef.current || composerBusy) return;
      attachmentArmedRef.current = true;
      const caption = message.trim();
      const file = pendingAttachment;
      setMessage('');
      setPendingAttachment(null);
      try {
        await uploadAttachment(file, caption);
      } catch (error) {
        showToast({ type: 'info', title: chatUploadErrorMessage(error) });
        setPendingAttachment(file);
        setMessage(caption);
      } finally {
        attachmentArmedRef.current = false;
      }
      return;
    }
    await handleSendText();
  };

  const rejectOversized = (size: number | undefined, label: string) => {
    if (!size || size <= MAX_CHAT_ATTACHMENT_BYTES) return false;
    showToast({
      type: 'info',
      title: `${label} too large. Maximum size is 100MB for chat.`,
    });
    return true;
  };

  const applyPickedImage = useCallback((asset: PickedChatImage) => {
    if (rejectOversized(asset.size, 'Image')) return;
    if (!isAllowedImage(asset.fileName, asset.mimeType)) {
      showToast({ type: 'info', title: 'Please choose an image.' });
      return;
    }
    setPendingAttachment({
      uri: asset.uri,
      previewUrl: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType || 'image/jpeg',
      size: asset.size,
      width: asset.width,
      height: asset.height,
      kind: 'image',
    });
  }, []);

  const pickFromGallery = async () => {
    if (composerBusy || pickingImageRef.current) return;
    pickingImageRef.current = true;
    try {
      const result = await pickGalleryImage();
      if (result.status === 'denied') {
        showMediaPermissionAlert();
      } else if (result.status === 'error') {
        showToast({ type: 'info', title: result.message });
      } else if (result.status === 'picked') {
        applyPickedImage(result.asset);
      }
    } catch {
      showToast({ type: 'info', title: 'Could not open the photo picker.' });
    } finally {
      pickingImageRef.current = false;
    }
  };

  const pickDocument = async () => {
    if (composerBusy) return;
    const result = await pickTeamChatDocument();
    if (result.status === 'canceled') return;
    if (result.status !== 'picked') {
      showToast({ type: 'info', title: result.message });
      return;
    }
    setPendingAttachment({
      uri: result.asset.uri,
      fileName: result.asset.fileName,
      mimeType: result.asset.mimeType,
      size: result.asset.size,
      kind: 'file',
    });
  };

  const openFileMessage = async (msg: any) => {
    const id = messageKey(msg);
    if (!msg?.url || msg.uploadState === 'uploading' || downloadingId) return;
    setDownloadingId(id);
    try {
      await downloadAndOpenFile(
        msg.url,
        msg.fileName,
        guessDocumentMime(msg.fileName, msg.mimeType)
      );
    } catch {
      showToast({ type: 'info', title: DOWNLOAD_FAILED_MESSAGE });
    } finally {
      setDownloadingId(null);
    }
  };

  const onListScroll = (offsetY: number, contentHeight: number, layoutHeight: number) => {
    nearBottomRef.current = contentHeight - (offsetY + layoutHeight) <= NEAR_BOTTOM_PX;
  };

  if (!raceId || normalizedTeamId == null) return null;

  const renderUploadStatus = (msg: any, isOwn: boolean) => {
    const statusColor = isOwn ? 'rgba(255,255,255,0.85)' : COLORS.inkSecondary;
    if (msg.uploadState === 'uploading') {
      const percent = Math.max(0, Math.min(100, Math.round(msg.uploadProgress || 0)));
      return (
        <View style={styles.uploadRow}>
          {msg.type !== 'file' ? <ActivityIndicator size="small" color={statusColor} /> : null}
          <Text style={[styles.uploadText, { color: statusColor }]}>Uploading... {percent}%</Text>
        </View>
      );
    }
    if (msg.uploadState === 'error') {
      return (
        <Text style={[styles.uploadText, { color: statusColor }]}>
          Upload failed.{' '}
          <Text style={styles.retry} onPress={() => retryUpload(msg.id)}>
            Retry
          </Text>
        </Text>
      );
    }
    return null;
  };

  const renderMessageBody = (msg: any, isOwn: boolean) => {
    const caption = String(msg.text || '').trim();
    const captionColor = isOwn ? COLORS.white : COLORS.text;
    if (msg.type === 'image' && (msg.url || msg.uploadState)) {
      return (
        <View>
          {msg.url ? (
            <Pressable onPress={() => setSelectedImage(msg.url)}>
              <ChatBubbleImage uri={msg.url} />
            </Pressable>
          ) : null}
          {caption ? <Text style={[styles.caption, { color: captionColor }]}>{caption}</Text> : null}
          {renderUploadStatus(msg, isOwn)}
        </View>
      );
    }
    if (msg.type === 'file' && (msg.url || msg.fileName || msg.uploadState)) {
      const cardBusy =
        msg.uploadState === 'uploading' || downloadingId === messageKey(msg);
      const sizeLabel =
        formatChatFileSize(msg.fileSize) || formatChatFileSize(estimateDataUrlBytes(msg.url));
      return (
        <View>
          <Pressable
            onPress={() => {
              if (msg.url && !cardBusy) openFileMessage(msg);
            }}
            disabled={cardBusy || !msg.url}
            accessibilityRole="button"
            accessibilityLabel={`Download ${msg.fileName || 'file'}`}
            style={styles.fileCard}>
            {cardBusy ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {msg.fileName || 'Download file'}
              </Text>
              {sizeLabel ? <Text style={styles.fileSize}>{sizeLabel}</Text> : null}
            </View>
            {!cardBusy ? (
              <Ionicons name="download-outline" size={18} color={COLORS.primary} />
            ) : null}
          </Pressable>
          {caption ? <Text style={[styles.caption, { color: captionColor }]}>{caption}</Text> : null}
          {renderUploadStatus(msg, isOwn)}
        </View>
      );
    }
    if (msg.type === 'link' && msg.url) {
      let hostname = msg.url;
      try {
        hostname = new URL(msg.url).hostname;
      } catch {
        // keep raw
      }
      return (
        <View>
          <Pressable onPress={() => Linking.openURL(msg.url)} style={styles.linkCard}>
            <Ionicons name="link-outline" size={16} color={COLORS.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.linkTitle} numberOfLines={1}>
                {msg.linkTitle || hostname}
              </Text>
              <Text style={styles.linkUrl} numberOfLines={1}>
                {msg.url}
              </Text>
            </View>
          </Pressable>
          {caption ? <Text style={[styles.caption, { color: captionColor }]}>{caption}</Text> : null}
        </View>
      );
    }
    return <Text style={[styles.bubbleText, { color: captionColor }]}>{msg.text}</Text>;
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isOwn = String(item.participantId || '') === currentParticipantId;
    const prev = index > 0 ? messages[index - 1] : null;
    const showSender =
      !isOwn && String(prev?.participantId || '') !== String(item.participantId || '');
    return (
      <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
        {showSender ? (
          <Text style={styles.sender}>{item.senderName || 'Teammate'}</Text>
        ) : null}
        <View
          style={[
            styles.bubble,
            isOwn ? styles.bubbleOwn : styles.bubbleOther,
            item.pending && styles.bubblePending,
          ]}>
          {renderMessageBody(item, isOwn)}
          <Text style={[styles.time, isOwn ? styles.timeOwn : styles.timeOther]}>
            {formatTime(item.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <>
      {!open ? (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open team chat"
          style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.white} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <KeyboardAwareBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        header={
          <View style={styles.sheetHeader}>
            <View style={styles.headerCopy}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                Team {normalizedTeamId} Chat
              </Text>
              <Text style={styles.sheetSub} numberOfLines={1}>
                Team chat - only your team members can see these messages
              </Text>
            </View>
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close team chat"
              hitSlop={8}
              style={styles.close}>
              <Ionicons name="close" size={22} color={COLORS.white} />
            </Pressable>
          </View>
        }
        footer={
          <View style={styles.composer}>
            {pendingAttachment ? (
              <View style={styles.previewWrap}>
                {pendingAttachment.kind === 'image' ? (
                  <Image source={{ uri: pendingAttachment.previewUrl || pendingAttachment.uri }} style={styles.previewImg} />
                ) : (
                  <View style={styles.previewFile}>
                    <Ionicons name="document-text-outline" size={16} color={COLORS.inkSecondary} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {pendingAttachment.fileName}
                      </Text>
                      {formatChatFileSize(pendingAttachment.size) ? (
                        <Text style={styles.previewSize}>
                          {formatChatFileSize(pendingAttachment.size)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                )}
                <Pressable
                  onPress={() => setPendingAttachment(null)}
                  style={styles.previewClear}
                  accessibilityLabel="Remove attachment">
                  <Ionicons name="close" size={12} color={COLORS.white} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <Pressable
                onPress={() => {
                  pickFromGallery().catch(() => undefined);
                }}
                disabled={composerBusy}
                accessibilityLabel="Share image"
                style={styles.iconBtn}>
                <Ionicons name="image-outline" size={22} color={COLORS.inkSecondary} />
              </Pressable>
              <Pressable
                onPress={pickDocument}
                disabled={composerBusy}
                accessibilityLabel="Share file"
                style={styles.iconBtn}>
                <Ionicons name="attach-outline" size={22} color={COLORS.inkSecondary} />
              </Pressable>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={pendingAttachment ? 'Add a caption...' : 'Message your team...'}
                placeholderTextColor={COLORS.darkTextSecondary}
                style={styles.chatInput}
                editable={!composerBusy}
                onSubmitEditing={handleSendComposer}
                returnKeyType="send"
              />
              <Pressable
                onPress={handleSendComposer}
                disabled={(!message.trim() && !pendingAttachment) || composerBusy}
                style={[
                  styles.sendBtn,
                  ((!message.trim() && !pendingAttachment) || composerBusy) && styles.disabled,
                ]}
                accessibilityLabel="Send">
                {composerBusy ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="send" size={18} color={COLORS.white} />
                )}
              </Pressable>
            </View>
            {isSending ? <Text style={styles.sending}>Sending...</Text> : null}
          </View>
        }>
            <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(item) => messageKey(item)}
              style={styles.list}
              contentContainerStyle={styles.listInner}
              keyboardShouldPersistTaps="handled"
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                onListScroll(contentOffset.y, contentSize.height, layoutMeasurement.height);
              }}
              scrollEventThrottle={16}
              maintainVisibleContentPosition={
                Platform.OS === 'ios' ? { minIndexForVisible: 0 } : undefined
              }
              onLayout={() => {
                if (!open) return;
                if (!didInitialScrollRef.current || forceScrollRef.current) scrollToBottom(false);
              }}
              onContentSizeChange={() => {
                if (!open) return;
                if (!didInitialScrollRef.current) {
                  didInitialScrollRef.current = true;
                  nearBottomRef.current = true;
                  scrollToBottom(false);
                  return;
                }
                if (forceScrollRef.current) {
                  nearBottomRef.current = true;
                  scrollToBottom(false);
                  forceScrollRef.current = false;
                }
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>No messages yet. Say hello to your team!</Text>
              }
              renderItem={renderItem}
            />

            {rtdbLoading && messages.length === 0 && !useApiFallback ? (
              <Text style={styles.syncNote}>Connecting to team chat...</Text>
            ) : null}
            </View>

            {selectedImage ? (
              <Pressable style={styles.lightbox} onPress={() => setSelectedImage(null)}>
                <Image source={{ uri: selectedImage }} style={styles.lightboxImg} resizeMode="contain" />
              </Pressable>
            ) : null}
      </KeyboardAwareBottomSheet>
    </>
  );
}

export const SPACE_RACE_FAB_BOTTOM_PAD = 88;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 40,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: FONT_WEIGHTS.bold },
  listWrap: { flex: 1, minHeight: 0 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    minHeight: 64,
    gap: SPACING[2],
  },
  headerCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 16 },
  sheetSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, backgroundColor: '#f0ebe8' },
  listInner: { padding: SPACING[4], flexGrow: 1 },
  empty: { textAlign: 'center', color: COLORS.mutedText, fontSize: 14, paddingVertical: SPACING[8] },
  syncNote: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.mutedText,
    paddingVertical: 4,
    backgroundColor: COLORS.surfaceMuted,
  },
  row: { marginBottom: SPACING[2], maxWidth: '80%' },
  rowOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium, color: COLORS.primary, marginBottom: 4, paddingHorizontal: 4 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '100%' },
  bubbleOwn: { backgroundColor: COLORS.primary, borderBottomRightRadius: 6 },
  bubbleOther: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  bubblePending: { opacity: 0.8 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 13, marginTop: 4 },
  time: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  timeOwn: { color: 'rgba(255,255,255,0.7)' },
  timeOther: { color: '#9ca3af' },
  bubbleImage: { width: 220, height: 160, borderRadius: 10, overflow: 'hidden' },
  bubbleImageFallback: {
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    minWidth: 180,
  },
  fileName: { color: COLORS.primary, fontSize: 13, fontWeight: FONT_WEIGHTS.medium },
  fileSize: { color: COLORS.mutedText, fontSize: 11, marginTop: 2 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.blush,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 8,
  },
  linkTitle: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium, fontSize: 13 },
  linkUrl: { color: COLORS.mutedText, fontSize: 11 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  uploadText: { fontSize: 12, marginTop: 4, color: COLORS.inkSecondary },
  retry: { textDecorationLine: 'underline', fontWeight: FONT_WEIGHTS.medium },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: SPACING[3],
  },
  previewWrap: { marginBottom: 8, alignSelf: 'flex-start' },
  previewImg: { width: 64, height: 64, borderRadius: 8 },
  previewFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    paddingRight: 28,
    maxWidth: 220,
  },
  previewName: { fontSize: 12, color: COLORS.text },
  previewSize: { fontSize: 11, color: COLORS.mutedText, marginTop: 1 },
  previewClear: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chatInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: SPACING[4],
    color: COLORS.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
  sending: { fontSize: 12, color: COLORS.mutedText, marginTop: 6 },
  lightbox: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING[4],
    zIndex: 30,
  },
  lightboxImg: { width: '100%', height: '80%' },
});
