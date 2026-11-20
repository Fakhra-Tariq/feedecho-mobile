import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import {
  HostChatAttachBar,
  PendingAttachmentPreview,
  type PendingAttachment,
} from '@/components/chat/HostChatAttachBar';
import { showAlert, showToast } from '@/components/feedback';
import { blockMobileLaunchIfBusy, cleanErrorMessage, showLaunchFailureAlert } from '@/lib/activeActivity';
import { ANOTHER_ACTIVITY_LIVE_HINT, liveActivityBlocksLaunch } from '@/lib/liveHostActivity';
import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { HostNoSessionBanner } from '@/components/HostNoSessionBanner';
import { HeroHowItWorksLink } from '@/components/HostHeroChrome';
import {
  KEYBOARD_SCROLL_PROPS,
  KeyboardBottomAnchor,
  KeyboardModalFrame,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions, useSessionActivityLabel } from '@/context/HostSessionContext';
import {
  addChatMessage,
  audienceMessageLabel,
  createAnonymousChat,
  deleteAnonymousChat,
  endAnonymousChat,
  isChatActive,
  isChatNamesVisible,
  isNamedAudienceMessage,
  syncChatStats,
  toggleChatModeration,
  toggleChatNamesVisible,
  type ChatSession,
} from '@/lib/anonymousChat';
import { hostLoneLinkUrl } from '@/lib/hostLoneLink';
import { shareChatResourceLink, uploadChatResourceFile } from '@/lib/liveChatResources';
import { isClaimedCurrentActivity, isLinkedSessionInactive } from '@/lib/sessionActivityMatch';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { toParticipantCount } from '@/lib/toParticipantCount';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

type ListTab = 'active' | 'past';

function formatEndedDate(iso?: string) {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  } catch {
    return '—';
  }
}

function NamesToggleButton({
  namesVisible,
  disabled,
  onPress,
}: {
  namesVisible: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const showLabel = width >= 400;
  const label = namesVisible ? 'Names visible' : 'Names hidden';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: namesVisible, disabled }}
      style={[
        styles.namesBtn,
        namesVisible && styles.namesBtnOn,
        disabled && styles.namesBtnDisabled,
      ]}>
      <Ionicons
        name={namesVisible ? 'eye-outline' : 'eye-off-outline'}
        size={16}
        color={namesVisible ? '#4A1F3D' : '#6D415F'}
      />
      {showLabel ? (
        <Text
          style={[styles.namesLabel, namesVisible && styles.namesLabelOn]}
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      <View
        style={[styles.namesSwitchTrack, namesVisible && styles.namesSwitchTrackOn]}
        accessibilityElementsHidden>
        <View style={[styles.namesSwitchThumb, namesVisible && styles.namesSwitchThumbOn]} />
      </View>
    </Pressable>
  );
}

export default function HostLiveChatScreen() {
  const { profile, user } = useAuth();
  const { activeSession, createSession, liveActivity, sessions, liveChats, liveChatsLoading } =
    useHostSessions();
  const activityStatus = useSessionActivityLabel();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const uid = String(user?.uid || profile?.uid || '').trim();

  const rtdbChats = useMemo(
    () =>
      [...(liveChats as ChatSession[])].sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      ),
    [liveChats]
  );
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [listTab, setListTab] = useState<ListTab>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<PendingAttachment | null>(null);
  const [attachmentSending, setAttachmentSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const sendChainRef = useRef(Promise.resolve());
  const inflightSendRef = useRef('');
  const uploadLockRef = useRef(false);
  const [togglingMod, setTogglingMod] = useState(false);
  const [togglingNames, setTogglingNames] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState('');
  const [createdSessionCode, setCreatedSessionCode] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const syncedStatsRef = useRef(new Set<string>());
  const selectedChatIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const [pendingChatDeletes, setPendingChatDeletes] = useState<string[]>([]);
  const [pendingChatEnds, setPendingChatEnds] = useState<string[]>([]);

  const sidebarChats = useMemo(() => {
    return rtdbChats
      .filter((chat) => !pendingChatDeletes.includes(chat.id))
      .map((chat) =>
        pendingChatEnds.includes(chat.id)
          ? { ...chat, status: 'ended' as const, isActive: false }
          : chat
      );
  }, [rtdbChats, pendingChatDeletes, pendingChatEnds]);

  useEffect(() => {
    setPendingChatDeletes((ids) => ids.filter((id) => rtdbChats.some((c) => c.id === id)));
    setPendingChatEnds((ids) =>
      ids.filter((id) => {
        const live = rtdbChats.find((c) => c.id === id);
        return Boolean(live && isChatActive(live));
      })
    );
  }, [rtdbChats]);
  const chatIsLive = (chat: ChatSession | null | undefined) =>
    Boolean(
      chat &&
        (isClaimedCurrentActivity('livechat', chat.id, activeSession) ||
          (isChatActive(chat) &&
            !isLinkedSessionInactive(chat as Record<string, unknown>, sessions)))
    );
  const activeChats = sidebarChats.filter((chat) => chatIsLive(chat));
  const endedChats = sidebarChats.filter(
    (chat) => !chatIsLive(chat) && (chat.status === 'ended' || chat.isActive === false || isLinkedSessionInactive(chat as Record<string, unknown>, sessions))
  );
  const listed = listTab === 'active' ? activeChats : endedChats;

  const { value: selectedLive } = useRtdbValue(
    selectedChatId ? `chat_sessions/${selectedChatId}` : null,
    { enabled: Boolean(selectedChatId) }
  );
  const { list: selectedMessages } = useRtdbList(
    selectedChatId ? `chat_messages/${selectedChatId}` : null,
    {
      enabled: Boolean(selectedChatId),
      sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
    }
  );

  const selectedChat: ChatSession | null = useMemo(() => {
    if (!selectedChatId) return null;
    const fromList = sidebarChats.find((c) => c.id === selectedChatId);
    return {
      ...(fromList || {}),
      ...(selectedLive || {}),
      id: selectedChatId,
    };
  }, [selectedChatId, selectedLive, sidebarChats]);

  const moderationOn = Boolean(selectedLive?.settings?.moderationMode);
  const namesVisible = isChatNamesVisible(selectedChat);
  const chatIsActive = chatIsLive(selectedChat);
  const namesToggleDisabled = !selectedChat || !chatIsActive;
  const participantCount = toParticipantCount(selectedLive?.participants);

  useEffect(() => {
    const ids = [...activeChats, ...endedChats].map((c) => c.id).filter(Boolean);
    ids.forEach((id) => {
      if (syncedStatsRef.current.has(id)) return;
      syncedStatsRef.current.add(id);
      syncChatStats(id).catch(() => undefined);
    });
  }, [activeChats, endedChats]);

  useEffect(() => {
    setMessageDraft('');
    setCodeCopied(false);
  }, [selectedChatId]);

  selectedChatIdRef.current = selectedChatId;

  /**
   * List and room share `/host/live-chat` (Chat tab). While a room is open,
   * intercept GO_BACK / POP / hardware back and only clear selectedChatId
   * so the list returns. Tab switches (NAVIGATE) are not blocked.
   */
  useEffect(() => {
    const closeOpenRoom = () => {
      if (!selectedChatIdRef.current) return false;
      setSelectedChatId(null);
      return true;
    };

    const stopRemove = navigation.addListener('beforeRemove', (e: any) => {
      if (!selectedChatIdRef.current) return;
      const type = e?.data?.action?.type as string | undefined;
      if (type && type !== 'GO_BACK' && type !== 'POP' && type !== 'POP_TO_TOP') {
        return;
      }
      e.preventDefault();
      setSelectedChatId(null);
    });

    const hardware = BackHandler.addEventListener('hardwareBackPress', closeOpenRoom);

    return () => {
      stopRemove();
      hardware.remove();
    };
  }, [navigation]);

  useEffect(() => {
    if (!selectedMessages.length) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [selectedMessages.length, selectedChatId]);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, () => {
      setKeyboardOpen(true);
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const chatLaunchBlocked = liveActivityBlocksLaunch(liveActivity);

  const onCreate = async () => {
    if (!createTitle.trim() || isCreating) return;
    if (!activeSession?.sessionCode) {
      showAlert({
        type: 'warning',
        title: 'No active session',
        message: 'Only one session can be active at a time. Create a session on Explore first.',
        primary: { label: 'Close' },
      });
      return;
    }
    if (blockMobileLaunchIfBusy(liveActivity, { type: 'livechat' })) return;
    if (activeChats.length > 0) {
      showAlert({
        type: 'warning',
        title: 'Active chat exists',
        message:
          'You already have an active chat. End the current chat before creating a new one.',
        primary: { label: 'Close' },
      });
      return;
    }

    setIsCreating(true);
    try {
      const chat = await createAnonymousChat({
        title: createTitle.trim(),
        description: createDescription.trim(),
      });
      setShowCreate(false);
      setCreateTitle('');
      setCreateDescription('');
      setCreatedCode(chat.joinCode || '');
      setSelectedChatId(chat.id);
      setListTab('active');
    } catch (error) {
      showLaunchFailureAlert(activeSession?.currentActivity, error, 'Try again');
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateChat = () => {
    if (blockMobileLaunchIfBusy(liveActivity, { type: 'livechat' })) return;
    setShowCreate(true);
  };

  const onToggleModeration = async () => {
    if (!selectedChatId || togglingMod || !chatIsActive) return;
    setTogglingMod(true);
    try {
      await toggleChatModeration(selectedChatId, !moderationOn);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Failed',
        message: cleanErrorMessage(error, 'Could not toggle moderation'),
        primary: { label: 'Close' },
      });
    } finally {
      setTogglingMod(false);
    }
  };

  const onToggleNamesVisible = async () => {
    if (!selectedChatId || togglingNames || namesToggleDisabled) return;
    setTogglingNames(true);
    try {
      await toggleChatNamesVisible(selectedChatId, !namesVisible);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Failed',
        message: cleanErrorMessage(error, 'Could not toggle names visibility'),
        primary: { label: 'Close' },
      });
    } finally {
      setTogglingNames(false);
    }
  };

  const onEndChat = async (chatId: string) => {
    try {
      await endAnonymousChat(chatId);
      if (selectedChatId === chatId) setSelectedChatId(null);
      setPendingChatEnds((ids) => (ids.includes(chatId) ? ids : [...ids, chatId]));
      showToast({ type: 'success', title: 'Ended', message: 'Chat ended' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'End failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteAnonymousChat(deleteTarget);
      if (selectedChatId === deleteTarget) setSelectedChatId(null);
      setPendingChatDeletes((ids) =>
        ids.includes(deleteTarget) ? ids : [...ids, deleteTarget]
      );
      setDeleteTarget(null);
      showToast({ type: 'success', title: 'Removed', message: 'Chat deleted' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Delete failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusyDelete(false);
    }
  };

  useEffect(() => {
    setPendingFile(null);
    setUploadError('');
    setUploadProgress(null);
    setAttachmentSending(false);
    uploadLockRef.current = false;
  }, [selectedChatId]);

  const onSend = () => {
    const trimmed = messageDraft.trim();
    const file = pendingFile;
    const chatId = selectedChatId;
    if ((!trimmed && !file) || !chatId || !chatIsActive) return;
    if (uploadLockRef.current) return;
    const signature = `${trimmed}\n${file ? `${file.name}:${file.size ?? ''}:${file.uri}` : ''}`;
    if (inflightSendRef.current === signature) return;

    inflightSendRef.current = signature;
    if (file) {
      uploadLockRef.current = true;
      setAttachmentSending(true);
    }
    if (trimmed) setMessageDraft('');

    sendChainRef.current = sendChainRef.current
      .catch(() => undefined)
      .then(async () => {
        let fileSent = false;
        try {
          if (file) {
            setUploadError('');
            setUploadProgress(0);
            const uploaded = await uploadChatResourceFile(
              chatId,
              { uri: file.uri, name: file.name, type: file.type },
              (loaded, total) => {
                if (!total) return;
                setUploadProgress(Math.min(99, Math.round((loaded / total) * 100)));
              }
            );
            if (uploaded && uploaded.success === false) {
              throw new Error(uploaded.error || 'Upload failed');
            }
            fileSent = true;
            setPendingFile((current) => (current?.uri === file.uri ? null : current));
            setUploadProgress(100);
            setTimeout(() => setUploadProgress(null), 600);
          }
          if (trimmed) {
            const loneLink = hostLoneLinkUrl(trimmed);
            if (loneLink) {
              const response = await shareChatResourceLink(chatId, loneLink);
              if (response && response.success === false) {
                throw new Error(response.error || 'Failed to send message');
              }
            } else {
              const response = await addChatMessage(chatId, { message: trimmed }, true);
              if (!response.success) {
                throw new Error(response.error || 'Failed to send message');
              }
            }
          }
        } catch (error) {
          if (trimmed) {
            setMessageDraft((current) => (String(current || '').trim() ? current : trimmed));
          }
          setUploadProgress(null);
          const message = cleanErrorMessage(error, 'Failed to send message');
          if (file && !fileSent) setUploadError(message);
          else {
            showAlert({
              type: 'error',
              title: 'Send failed',
              message,
              primary: { label: 'Close' },
            });
          }
        } finally {
          uploadLockRef.current = false;
          setAttachmentSending(false);
          if (inflightSendRef.current === signature) inflightSendRef.current = '';
        }
      });
  };

  const copyCode = async (code?: string) => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1600);
    } catch {
      showAlert({
        type: 'error',
        title: 'Copy failed',
        message: 'Copy the code manually.',
        primary: { label: 'Close' },
      });
    }
  };

  if (selectedChatId && selectedChat) {
    const joinCode = selectedChat.joinCode || '';
    const canSend = (Boolean(messageDraft.trim()) || Boolean(pendingFile)) && !attachmentSending;

    return (
      <KeyboardSafeScreen scroll={false} style={styles.screen}>
        <View
          style={[
            styles.roomCard,
            {
              marginBottom: keyboardOpen
                ? 0
                : TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8),
            },
          ]}>
          <View style={styles.roomHeader}>
            <View style={styles.roomTitleRow}>
              <View style={styles.roomLeftGroup}>
                <Text style={styles.roomTitle} numberOfLines={1}>
                  {selectedChat.title || 'Anonymous Chat'}
                </Text>
                <View style={styles.roomParticipants}>
                  <Ionicons name="people-outline" size={16} color="#5F5460" />
                  <Text style={styles.roomMetaText} numberOfLines={1}>
                    {participantCount} participants
                  </Text>
                </View>
              </View>
              {joinCode ? (
                <View style={styles.roomRightGroup}>
                  <Text style={styles.roomCode} numberOfLines={1}>
                    {joinCode}
                  </Text>
                  <Pressable
                    onPress={() => copyCode(joinCode)}
                    style={styles.copyIconBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Copy code"
                    hitSlop={4}>
                    <Ionicons
                      name={codeCopied ? 'checkmark' : 'copy-outline'}
                      size={18}
                      color="#6B3A5C"
                    />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          {chatIsActive ? (
            <View style={styles.roomActions}>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.moderationBtn, moderationOn && styles.moderationBtnOn]}
                  onPress={onToggleModeration}
                  disabled={togglingMod || namesToggleDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={moderationOn ? 'Moderation ON' : 'Moderation OFF'}
                  accessibilityState={{ disabled: togglingMod || namesToggleDisabled }}>
                  <Ionicons
                    name="settings-outline"
                    size={16}
                    color={moderationOn ? COLORS.white : COLORS.primary}
                  />
                  <Text
                    style={[styles.moderationLabel, moderationOn && styles.moderationLabelOn]}
                    numberOfLines={1}>
                    {togglingMod ? '…' : moderationOn ? 'Moderation ON' : 'Moderation OFF'}
                  </Text>
                </Pressable>
                <NamesToggleButton
                  namesVisible={namesVisible}
                  disabled={namesToggleDisabled || togglingNames}
                  onPress={onToggleNamesVisible}
                />
              </View>
              <Pressable
                style={({ pressed }) => [styles.endChatBtn, pressed && styles.endChatBtnPressed]}
                onPress={() =>
                  showAlert({
                    type: 'destructive',
                    title: 'End chat?',
                    message: 'Students will no longer be able to join or send.',
                    primary: {
                      label: 'End chat',
                      onPress: () => onEndChat(selectedChatId),
                    },
                    secondary: { label: 'Cancel' },
                    dismissOnBackdrop: false,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="End Chat">
                <Text style={styles.endChatLabel}>End Chat</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.roomActions}>
              <Text style={styles.endedBanner}>This chat has ended</Text>
            </View>
          )}

          <View style={styles.roomDivider} />

          <FlatList
            ref={listRef}
            style={styles.messageArea}
            data={selectedMessages.filter((m) => !m.isHidden)}
            keyExtractor={(item) => item.id}
            {...KEYBOARD_SCROLL_PROPS}
            contentContainerStyle={[
              styles.messages,
              selectedMessages.filter((m) => !m.isHidden).length === 0 && styles.messagesEmpty,
            ]}
            ListEmptyComponent={
              <View style={styles.roomEmpty}>
                <View style={styles.roomEmptyIcon}>
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.plum} />
                </View>
                <Text style={styles.roomEmptyText}>
                  No messages yet. Share the access code with the audience to start receiving
                  questions.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const fromTeacher = Boolean(item.isTeacher);
              return (
                <ChatMessageBubble
                  message={item}
                  isOwn={fromTeacher}
                  label={fromTeacher ? 'You' : audienceMessageLabel(item)}
                  namedSender={isNamedAudienceMessage(item, { fromTeacher })}
                  showStudentDot={!fromTeacher}
                />
              );
            }}
          />

          {chatIsActive ? (
            <KeyboardBottomAnchor style={styles.inputBar}>
              {pendingFile ? (
                <PendingAttachmentPreview
                  file={pendingFile}
                  progress={uploadProgress}
                  busy={attachmentSending}
                  onRemove={() => {
                    if (attachmentSending) return;
                    setPendingFile(null);
                  }}
                />
              ) : null}
              <View style={styles.inputPill}>
                <HostChatAttachBar
                  disabled={attachmentSending}
                  onError={setUploadError}
                  onPicked={(file) => {
                    setUploadError('');
                    setPendingFile(file);
                  }}
                />
                <TextInput
                  value={messageDraft}
                  onChangeText={setMessageDraft}
                  placeholder="Message audience..."
                  placeholderTextColor={COLORS.inkSecondary}
                  style={styles.input}
                  onSubmitEditing={onSend}
                  returnKeyType="send"
                />
                <Pressable
                  style={[styles.sendRound, !canSend && styles.sendRoundDisabled]}
                  onPress={onSend}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send message">
                  <Ionicons name="send" size={16} color={COLORS.white} />
                </Pressable>
              </View>
              {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}
            </KeyboardBottomAnchor>
          ) : null}
        </View>

        <ActivityCreatedModal
          visible={Boolean(createdCode)}
          title="Chat Created"
          code={createdCode}
          onClose={() => setCreatedCode('')}
        />
      </KeyboardSafeScreen>
    );
  }

  const sessionCode = activeSession?.sessionCode || '—';

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageScrollContent,
          { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {activeSession ? (
          <View style={styles.sessionPill} accessibilityRole="text">
            <Ionicons name="checkmark-circle-outline" size={16} color="#6B3A5C" />
            <Text style={styles.sessionPillText}>
              {'Launching to session: '}
              <Text style={styles.sessionPillCode}>{sessionCode}</Text>
              {` · ${activityStatus}`}
            </Text>
          </View>
        ) : (
          <HostNoSessionBanner
            style={styles.sessionIdleBanner}
            onCreateSession={() => setShowCreateSession(true)}
          />
        )}

        <View style={styles.heroCard}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>Anonymous Chat</Text>
            <HeroHowItWorksLink onPress={() => setHowItWorksOpen(true)} />
          </View>
          <Text style={styles.heroSubtitle}>Anonymous Q&A and feedback sessions</Text>
          <Pressable
            style={({ pressed }) => [
              styles.newChatBtn,
              chatLaunchBlocked && styles.newChatBtnDisabled,
              pressed && !chatLaunchBlocked && styles.newChatBtnPressed,
            ]}
            onPress={openCreateChat}
            disabled={chatLaunchBlocked}
            accessibilityRole="button"
            accessibilityLabel={chatLaunchBlocked ? 'New chat, another activity is live' : 'New chat'}
            accessibilityState={{ disabled: chatLaunchBlocked }}>
            <Ionicons name="chatbubble-outline" size={18} color="#6D415F" />
            <Text style={styles.newChatLabel}>New Chat</Text>
          </Pressable>
          {chatLaunchBlocked ? (
            <Text style={styles.busyHint}>{ANOTHER_ACTIVITY_LIVE_HINT}</Text>
          ) : null}
        </View>

        <View style={styles.contentCard}>
          <View style={styles.tabs}>
            {([
              ['active', `Active (${activeChats.length})`, 'Active chats tab'],
              ['past', `Past (${endedChats.length})`, 'Past chats tab'],
            ] as const).map(([id, label, a11y]) => {
              const on = listTab === id;
              return (
                <Pressable
                  key={id}
                  style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}
                  onPress={() => setListTab(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={a11y}>
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {liveChatsLoading && rtdbChats.length === 0 ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : listed.length === 0 ? (
            <View style={styles.emptyWrap}>
              {listTab === 'active' ? (
                <>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbubbles-outline" size={22} color="#6B3A5C" />
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.emptyCreateBtn,
                      chatLaunchBlocked && styles.createSubmitDisabled,
                      pressed && !chatLaunchBlocked && styles.emptyCreateBtnPressed,
                    ]}
                    onPress={openCreateChat}
                    disabled={chatLaunchBlocked}
                    accessibilityRole="button"
                    accessibilityLabel={
                      chatLaunchBlocked ? 'Create chat, another activity is live' : 'Create chat'
                    }
                    accessibilityState={{ disabled: chatLaunchBlocked }}>
                    <Ionicons name="add" size={18} color={COLORS.white} />
                    <Text style={styles.emptyCreateLabel}>Create Chat</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Ionicons
                    name="time-outline"
                    size={24}
                    color="rgba(109,65,95,0.3)"
                  />
                  <Text style={styles.emptyTitle}>No past chats</Text>
                </>
              )}
            </View>
          ) : (
            listed.map((item) => {
              const ended = !isChatActive(item);
              const endedStamp = formatEndedDate(
                item.endedAt || item.updatedAt || item.lastActivity || item.createdAt
              );
              const msgCount = item.messageCount ?? 0;
              const participants = toParticipantCount(item.participants);
              const joinCode = item.joinCode || '';

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.chatRow, pressed && styles.pressed]}
                  onPress={() => setSelectedChatId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || 'Untitled chat'}>
                  <View style={styles.chatRowTop}>
                    <View style={styles.chatRowTitleGroup}>
                      <View
                        style={[styles.statusDot, ended ? styles.statusDotEnded : styles.statusDotActive]}
                      />
                      <Text style={styles.chatRowTitle} numberOfLines={1}>
                        {item.title || 'Untitled chat'}
                      </Text>
                    </View>
                    {!ended ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.endChipBtn,
                          pressed && styles.endChipBtnPressed,
                        ]}
                        onPress={() => onEndChat(item.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="End chat">
                        <Text style={styles.endChipBtnLabel}>End</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [
                          styles.deleteBtn,
                          pressed && styles.deleteBtnPressed,
                        ]}
                        onPress={() => setDeleteTarget(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Delete chat">
                        <Ionicons name="trash-outline" size={18} color="#B3261E" />
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.chatRowMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="chatbubble-outline" size={16} color="#5F5460" />
                      <Text style={styles.metaText}>{msgCount}</Text>
                    </View>
                    {!ended ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="people-outline" size={16} color="#5F5460" />
                        <Text style={styles.metaText}>{participants}</Text>
                      </View>
                    ) : (
                      <Text style={styles.metaText}>Ended {endedStamp}</Text>
                    )}
                    {!ended && joinCode ? (
                      <View style={styles.codeGroup}>
                        <View style={styles.codePill}>
                          <Text style={styles.codePillText}>Code: {joinCode}</Text>
                        </View>
                        <Pressable
                          onPress={() => copyCode(joinCode)}
                          style={styles.copyCodeBtn}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel="Copy code">
                          <Ionicons
                            name={codeCopied ? 'checkmark' : 'copy-outline'}
                            size={18}
                            color="#6B3A5C"
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={howItWorksOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHowItWorksOpen(false)}>
        <Pressable
          style={styles.howOverlay}
          onPress={() => setHowItWorksOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close">
          <Pressable style={styles.howCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.howHeader}>
              <View style={styles.howTitleRow}>
                <Ionicons name="help-circle-outline" size={20} color="#6B3A5C" />
                <Text style={styles.howTitle}>How this works</Text>
              </View>
              <Pressable
                onPress={() => setHowItWorksOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.howCloseBtn}>
                <Ionicons name="close" size={20} color="#5F5460" />
              </Pressable>
            </View>
            {(
              [
                'Create a new chat with a title and description',
                'Launching requires an active session',
                'The audience sends anonymous messages/questions',
                "You respond verbally in class; there's no written reply sent back through the app. Use Moderation ON/OFF to control the chat.",
              ] as const
            ).map((step, index) => (
              <Text key={step} style={styles.howStep}>
                {index + 1}. {step}
              </Text>
            ))}
            <Pressable
              style={({ pressed }) => [styles.howGotIt, pressed && styles.pressed]}
              onPress={() => setHowItWorksOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Got it">
              <Text style={styles.howGotItLabel}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
        statusBarTranslucent>
        <View style={styles.createModalRoot}>
          <KeyboardModalFrame
            style={styles.createBackdropFill}
            onBackdropPress={() => setShowCreate(false)}>
            <View style={styles.createCard} accessibilityViewIsModal>
              <Text style={styles.createModalTitle}>Create Anonymous Chat</Text>
              <View style={styles.createDivider} />

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                style={styles.createCardScroll}
                contentContainerStyle={{ flexGrow: 0 }}>
                <Text style={[styles.createFieldLabel, { marginTop: 16 }]}>Chat Title</Text>
                <TextInput
                  value={createTitle}
                  onChangeText={setCreateTitle}
                  placeholder="e.g., Weekly Q&A Session"
                  placeholderTextColor="#8A7F89"
                  style={styles.createInput}
                  accessibilityLabel="Chat title"
                />

                <Text style={[styles.createFieldLabel, { marginTop: 14 }]}>Description</Text>
                <TextInput
                  value={createDescription}
                  onChangeText={setCreateDescription}
                  placeholder="Optional description for the audience"
                  placeholderTextColor="#8A7F89"
                  style={[styles.createInput, styles.createInputMulti]}
                  multiline
                  textAlignVertical="top"
                  accessibilityLabel="Description"
                />
              </ScrollView>

              <View style={[styles.createDivider, { marginTop: 16 }]} />

              <Pressable
                style={({ pressed }) => [
                  styles.createSubmitBtn,
                  (!createTitle.trim() || isCreating || chatLaunchBlocked) &&
                    styles.createSubmitDisabled,
                  createTitle.trim() &&
                    !isCreating &&
                    !chatLaunchBlocked &&
                    pressed &&
                    styles.createSubmitPressed,
                ]}
                onPress={onCreate}
                disabled={!createTitle.trim() || isCreating || chatLaunchBlocked}
                accessibilityRole="button"
                accessibilityLabel={
                  chatLaunchBlocked ? 'Create chat, another activity is live' : 'Create chat'
                }
                accessibilityState={{
                  disabled: !createTitle.trim() || isCreating || chatLaunchBlocked,
                }}>
                {isCreating ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.createSubmitLabel}>Create Chat</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.createCancelBtn,
                  pressed && styles.createCancelPressed,
                ]}
                onPress={() => setShowCreate(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.createCancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </KeyboardModalFrame>
        </View>
      </Modal>

      <ActivityCreatedModal
        visible={Boolean(createdCode)}
        title="Chat Created"
        code={createdCode}
        onClose={() => setCreatedCode('')}
      />

      <ActivityCreatedModal
        visible={Boolean(createdSessionCode)}
        title="Session Created!"
        code={createdSessionCode}
        onClose={() => setCreatedSessionCode('')}
      />

      <CreateSessionModal
        visible={showCreateSession}
        title="Create Session"
        value={sessionNameDraft}
        onChangeText={setSessionNameDraft}
        submitting={creatingSession}
        onCancel={() => {
          setShowCreateSession(false);
          setSessionNameDraft('');
        }}
        onSubmit={async () => {
          if (creatingSession || !sessionNameDraft.trim()) return;
          setCreatingSession(true);
          try {
            const session = await createSession(sessionNameDraft.trim());
            setShowCreateSession(false);
            setSessionNameDraft('');
            setCreatedSessionCode(session.sessionCode);
          } catch (error) {
            showAlert({
              type: 'error',
              title: 'Could not create session',
              message: cleanErrorMessage(error, 'Try again'),
              primary: { label: 'Close' },
            });
          } finally {
            setCreatingSession(false);
          }
        }}
      />

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="Delete chat?"
        message="This permanently removes the chat and its messages."
        confirmLabel="Delete"
        destructive
        busy={busyDelete}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  pageScroll: { flex: 1 },
  pageScrollContent: {
    paddingBottom: 20,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1E4EC',
    borderWidth: 1,
    borderColor: '#E3CFDB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  sessionIdleBanner: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  sessionPillText: {
    flex: 1,
    color: '#4A1F3D',
    fontSize: 12,
    lineHeight: 16,
  },
  sessionPillCode: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  sessionPillLink: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6D415F',
    textDecorationLine: 'underline',
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroTitle: {
    flex: 1,
    color: COLORS.white,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
  },
  howItWorksBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 4,
  },
  howItWorksLabel: {
    color: '#EADBE5',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
  },
  heroSubtitle: {
    color: '#EADBE5',
    fontSize: 13,
    marginTop: 4,
  },
  newChatBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newChatBtnPressed: {
    backgroundColor: '#F4EAF0',
  },
  newChatBtnDisabled: {
    opacity: 0.55,
  },
  busyHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#EADBE5',
    textAlign: 'center',
  },
  newChatLabel: {
    color: '#6D415F',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
  contentCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.15)',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: {
    backgroundColor: '#F1E5EB',
    borderColor: '#F1E5EB',
  },
  tabLabel: {
    color: '#6D415F',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  tabLabelOn: {
    color: '#6D415F',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1E4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  emptyCreateBtn: {
    marginTop: 14,
    width: '70%',
    minWidth: 180,
    maxWidth: 260,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.plum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyCreateBtnPressed: {
    backgroundColor: '#5A2F4D',
  },
  emptyCreateLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  emptyTitle: {
    marginTop: 8,
    color: COLORS.darkTextSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyMessage: {
    color: COLORS.inkSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 260,
    lineHeight: 16,
  },
  chatRow: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ECE3EA',
    borderRadius: 14,
    padding: 12,
    backgroundColor: COLORS.white,
  },
  chatRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chatRowTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotActive: { backgroundColor: '#22C55E' },
  statusDotEnded: { backgroundColor: 'rgba(95, 84, 96, 0.4)' },
  chatRowTitle: {
    flex: 1,
    color: '#2B1F27',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
  },
  chatRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#5F5460',
    fontSize: 13,
  },
  codeGroup: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  codePill: {
    backgroundColor: '#F1EDF0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codePillText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#2B1F27',
  },
  copyCodeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endChipBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endChipBtnPressed: {
    backgroundColor: '#DC2626',
  },
  endChipBtnLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  deleteBtnPressed: {
    backgroundColor: '#FEE2E2',
  },
  pressed: { opacity: 0.85 },
  howOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  howCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
  },
  howHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  howTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  howTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  howCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howStep: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5A4A55',
    marginBottom: 8,
  },
  howGotIt: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6B3A5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howGotItLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  roomCard: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
  },
  roomHeader: {
    padding: 0,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  roomLeftGroup: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  roomRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    marginLeft: 8,
  },
  roomTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  roomParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  roomMetaText: {
    fontSize: 13,
    color: '#5F5460',
  },
  roomCode: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6B3A5C',
    letterSpacing: 1,
    flexShrink: 0,
  },
  copyIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roomActions: {
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  moderationBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  namesBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  namesBtnOn: {
    backgroundColor: COLORS.white,
    borderColor: '#6B3A5C',
  },
  namesBtnDisabled: {
    opacity: 0.5,
  },
  namesLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: '#6D415F',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  namesLabelOn: {
    color: '#4A1F3D',
    fontWeight: '500',
  },
  namesSwitchTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(109,65,95,0.25)',
    justifyContent: 'center',
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  namesSwitchTrackOn: {
    backgroundColor: '#6B3A5C',
  },
  namesSwitchThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.white,
  },
  namesSwitchThumbOn: {
    alignSelf: 'flex-end',
  },
  moderationBtnOn: {
    backgroundColor: '#6D415F',
    borderColor: '#6D415F',
  },
  moderationLabel: {
    color: '#6D415F',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
  moderationLabelOn: {
    color: COLORS.white,
  },
  endChatBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endChatBtnPressed: {
    backgroundColor: '#DC2626',
  },
  endChatLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
  endedBanner: {
    color: COLORS.warning,
    fontWeight: FONT_WEIGHTS.medium,
    paddingVertical: 8,
  },
  roomDivider: {
    height: 1,
    backgroundColor: '#EFE7EC',
  },
  messageArea: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  messages: {
    padding: SPACING[4],
    paddingBottom: SPACING[3],
    flexGrow: 1,
  },
  messagesEmpty: {
    justifyContent: 'center',
  },
  roomEmpty: {
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
  },
  roomEmptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.plumTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roomEmptyText: {
    fontSize: 13,
    color: COLORS.ink,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
  },
  inputBar: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EFE7EC',
    backgroundColor: COLORS.white,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.cream,
    paddingLeft: 4,
    paddingRight: 4,
  },
  uploadError: {
    marginTop: 6,
    fontSize: 12,
    color: '#DC2626',
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: COLORS.ink,
    paddingVertical: 0,
    marginRight: 8,
  },
  sendRound: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRoundDisabled: {
    backgroundColor: '#B99AAD',
  },
  disabled: { opacity: 0.6 },
  createModalRoot: { flex: 1 },
  createBackdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
  },
  createCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '100%',
    alignSelf: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    flexShrink: 1,
    zIndex: 1,
  },
  createCardScroll: {
    flexShrink: 1,
    minHeight: 0,
    paddingBottom: 4,
  },
  createModalTitle: {
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2B1F27',
  },
  createDivider: {
    height: 1,
    backgroundColor: '#EFE7EC',
    marginTop: 14,
  },
  createFieldLabel: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  createInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    marginTop: 8,
    fontSize: 14,
    color: '#2B1F27',
  },
  createInputMulti: {
    height: undefined,
    minHeight: 90,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  createSubmitBtn: {
    marginTop: 16,
    minHeight: 44,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#6D415F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubmitDisabled: {
    backgroundColor: '#B99AAD',
  },
  createSubmitPressed: {
    backgroundColor: '#5A2F4D',
  },
  createSubmitLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  createCancelBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCancelPressed: {
    backgroundColor: '#E5E7EB',
  },
  createCancelLabel: {
    color: COLORS.darkTextSecondary,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
