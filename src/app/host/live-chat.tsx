import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { showAlert, showToast } from '@/components/feedback';
import { cleanErrorMessage, showLaunchFailureAlert } from '@/lib/activeActivity';
import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreateSessionModal } from '@/components/CreateSessionModal';
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
  createAnonymousChat,
  deleteAnonymousChat,
  endAnonymousChat,
  isChatActive,
  listAnonymousChats,
  syncChatStats,
  toggleChatModeration,
  type ChatSession,
} from '@/lib/anonymousChat';
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

export default function HostLiveChatScreen() {
  const { profile } = useAuth();
  const { activeSession, createSession } = useHostSessions();
  const activityStatus = useSessionActivityLabel();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const uid = profile?.uid || '';

  const { list: rtdbChats } = useRtdbList('chat_sessions', {
    enabled: Boolean(uid),
    filter: (chat) => {
      if (!uid) return true;
      return chat?.createdBy === uid || chat?.createdBy == null;
    },
    sort: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  });

  const [apiChats, setApiChats] = useState<ChatSession[]>([]);
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
  const [isSending, setIsSending] = useState(false);
  const [togglingMod, setTogglingMod] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const syncedStatsRef = useRef(new Set<string>());
  const selectedChatIdRef = useRef<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const [pendingChatDeletes, setPendingChatDeletes] = useState<string[]>([]);
  const [pendingChatEnds, setPendingChatEnds] = useState<string[]>([]);

  const sidebarChats = useMemo(() => {
    const source = rtdbChats.length > 0 ? rtdbChats : apiChats;
    return source
      .filter((chat) => !pendingChatDeletes.includes(chat.id))
      .map((chat) =>
        pendingChatEnds.includes(chat.id)
          ? { ...chat, status: 'ended' as const, isActive: false }
          : chat
      );
  }, [rtdbChats, apiChats, pendingChatDeletes, pendingChatEnds]);

  useEffect(() => {
    const source = rtdbChats.length > 0 ? rtdbChats : apiChats;
    setPendingChatDeletes((ids) => ids.filter((id) => source.some((c) => c.id === id)));
    setPendingChatEnds((ids) =>
      ids.filter((id) => {
        const live = source.find((c) => c.id === id);
        return Boolean(live && isChatActive(live));
      })
    );
  }, [rtdbChats, apiChats]);
  const activeChats = sidebarChats.filter((chat) => isChatActive(chat));
  const endedChats = sidebarChats.filter(
    (chat) => chat.status === 'ended' || chat.isActive === false
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
  const chatIsActive = isChatActive(selectedChat);
  const participantCount = toParticipantCount(selectedLive?.participants);

  useEffect(() => {
    if (!uid) return;
    listAnonymousChats()
      .then(setApiChats)
      .catch(() => undefined);
  }, [uid]);

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
   * List and room share `/host/live-chat`. Default stack back (header arrow,
   * Android hardware back, swipe) pops this screen to Explore. While a room
   * is open, intercept that and only clear selectedChatId so the list
   * returns; do not change chat data. List back then pops to Explore.
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

  const loadApi = async () => {
    try {
      setApiChats(await listAnonymousChats());
    } catch {
      // RTDB list remains source of truth
    }
  };

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
      await loadApi();
    } catch (error) {
      showLaunchFailureAlert(activeSession?.currentActivity, error, 'Try again');
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateChat = () => setShowCreate(true);

  const onToggleModeration = async () => {
    if (!selectedChatId || togglingMod) return;
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

  const onEndChat = async (chatId: string) => {
    try {
      await endAnonymousChat(chatId);
      if (selectedChatId === chatId) setSelectedChatId(null);
      setPendingChatEnds((ids) => (ids.includes(chatId) ? ids : [...ids, chatId]));
      await loadApi();
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
      await loadApi();
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

  const onSend = async () => {
    const trimmed = messageDraft.trim();
    if (!trimmed || !selectedChatId || isSending || !chatIsActive) return;
    setIsSending(true);
    try {
      const response = await addChatMessage(selectedChatId, { message: trimmed }, true);
      if (!response.success) {
        showAlert({
          type: 'error',
          title: 'Send failed',
          message: cleanErrorMessage(response.error, 'Failed to send message'),
          primary: { label: 'Close' },
        });
        return;
      }
      setMessageDraft('');
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Send failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setIsSending(false);
    }
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
    const canSend = Boolean(messageDraft.trim()) && !isSending;

    return (
      <KeyboardSafeScreen scroll={false} style={styles.screen}>
        <View
          style={[
            styles.roomCard,
            {
              marginBottom: keyboardOpen ? 0 : Math.max(insets.bottom, 8),
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
              <Pressable
                style={[styles.moderationBtn, moderationOn && styles.moderationBtnOn]}
                onPress={onToggleModeration}
                disabled={togglingMod}
                accessibilityRole="button"
                accessibilityLabel={moderationOn ? 'Moderation ON' : 'Moderation OFF'}>
                <Ionicons
                  name="settings-outline"
                  size={16}
                  color={moderationOn ? COLORS.white : COLORS.primary}
                />
                <Text style={[styles.moderationLabel, moderationOn && styles.moderationLabelOn]}>
                  {togglingMod ? '…' : moderationOn ? 'Moderation ON' : 'Moderation OFF'}
                </Text>
              </Pressable>
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
            renderItem={({ item }) => (
              <ChatMessageBubble
                message={item}
                isOwn={Boolean(item.isTeacher)}
                label={item.isTeacher ? 'You' : 'Audience'}
                showStudentDot={!item.isTeacher}
              />
            )}
          />

          {chatIsActive ? (
            <KeyboardBottomAnchor style={styles.inputBar}>
              <View style={styles.inputPill}>
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
        contentContainerStyle={styles.pageScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.sessionPill} accessibilityRole="text">
          <Ionicons
            name={activeSession ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={16}
            color="#6B3A5C"
          />
          {activeSession ? (
            <Text style={styles.sessionPillText}>
              {'Launching to session: '}
              <Text style={styles.sessionPillCode}>{sessionCode}</Text>
              {` · ${activityStatus}`}
            </Text>
          ) : (
            <Text style={styles.sessionPillText}>
              {"You'll need an active session to launch this. "}
              <Text
                style={styles.sessionPillLink}
                onPress={() => setShowCreateSession(true)}
                accessibilityRole="link">
                Create Session
              </Text>
            </Text>
          )}
        </View>

        <LinearGradient
          colors={['#6D415F', 'rgba(109,65,95,0.92)', '#3A2E2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>Anonymous Chat</Text>
            <HeroHowItWorksLink onPress={() => setHowItWorksOpen(true)} />
          </View>
          <Text style={styles.heroSubtitle}>Anonymous Q&A and feedback sessions</Text>
          <Pressable
            style={({ pressed }) => [styles.newChatBtn, pressed && styles.newChatBtnPressed]}
            onPress={openCreateChat}
            accessibilityRole="button"
            accessibilityLabel="New chat">
            <Ionicons name="chatbubble-outline" size={18} color="#6D415F" />
            <Text style={styles.newChatLabel}>New Chat</Text>
          </Pressable>
        </LinearGradient>

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

          {listed.length === 0 ? (
            <View style={styles.emptyWrap}>
              {listTab === 'active' ? (
                <>
                  <View style={styles.emptyIconCircle}>
                    <Ionicons name="chatbubbles-outline" size={22} color="#6B3A5C" />
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.emptyCreateBtn,
                      pressed && styles.emptyCreateBtnPressed,
                    ]}
                    onPress={openCreateChat}
                    accessibilityRole="button"
                    accessibilityLabel="Create chat">
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
                  (!createTitle.trim() || isCreating) && styles.createSubmitDisabled,
                  createTitle.trim() && !isCreating && pressed && styles.createSubmitPressed,
                ]}
                onPress={onCreate}
                disabled={!createTitle.trim() || isCreating}
                accessibilityRole="button"
                accessibilityLabel="Create chat"
                accessibilityState={{ disabled: !createTitle.trim() || isCreating }}>
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
            await createSession(sessionNameDraft.trim());
            setShowCreateSession(false);
            setSessionNameDraft('');
            showToast({ type: 'success', title: 'Created', message: 'Session created successfully!' });
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
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
    flex: 1.4,
    height: 44,
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
    paddingLeft: 14,
    paddingRight: 4,
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
