import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { showAlert } from '@/components/feedback';
import {
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { LogoutButton } from '@/components/LogoutButton';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { useLeaveActivity } from '@/lib/audienceHomeNavigation';
import {
  addChatMessage,
  chatParticipantStorageKey,
  chatPresence,
  getChatByCode,
  getOrCreateChatParticipantId,
  isChatSessionEnded,
  leaveChat,
  type ChatJoinIdentity,
} from '@/lib/anonymousChat';
import { useSafeTabBarStyle } from '@/lib/tabBarSafeArea';
import { toParticipantCount } from '@/lib/toParticipantCount';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';

async function resolveParticipantId(code: string, identity: ChatJoinIdentity) {
  const key = chatParticipantStorageKey(code, identity);
  if (!key) return getOrCreateChatParticipantId();
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const next = getOrCreateChatParticipantId();
  await AsyncStorage.setItem(key, next);
  return next;
}

export default function AudienceLiveChatScreen() {
  const { profile } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarStyle = useSafeTabBarStyle();
  const params = useLocalSearchParams<{ code?: string }>();
  const isGuest = Boolean(profile?.guest);
  const { leave } = useLeaveActivity({ headerBack: !isGuest });
  const leftOnEndRef = useRef(false);

  const [sessionCode, setSessionCode] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [storedGuestName, setStoredGuestName] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const lastAutoJoinRef = useRef<string | null>(null);
  const guestBottomMargin = 16 + (keyboardOpen ? 0 : insets.bottom);

  const normalizedCode = useMemo(() => sessionCode.trim().toUpperCase(), [sessionCode]);

  const { value: joinResolvedChatId } = useRtdbValue(
    normalizedCode ? `chat_join_codes/${normalizedCode}` : null,
    { enabled: Boolean(normalizedCode) }
  );

  useEffect(() => {
    if (!joinResolvedChatId) return;
    setChatId(String(joinResolvedChatId));
  }, [joinResolvedChatId]);

  const liveChatId = joinResolvedChatId ? String(joinResolvedChatId) : chatId;

  const { value: chatSession } = useRtdbValue(liveChatId ? `chat_sessions/${liveChatId}` : null, {
    enabled: Boolean(liveChatId),
  });

  const { list: messages } = useRtdbList(liveChatId ? `chat_messages/${liveChatId}` : null, {
    enabled: Boolean(liveChatId),
    sort: (a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')),
  });

  const isChatEnded = isChatSessionEnded(chatSession);
  const canSendMessages = Boolean(
    chatSession && !isChatEnded && chatSession?.settings?.moderationMode === true
  );
  const participantCount = toParticipantCount(chatSession?.participants);
  const visibleMessages = messages.filter((msg) => !msg.isHidden);
  const showActiveChat = Boolean(chatSession && !isChatEnded);

  const chatTitle =
    showActiveChat && chatSession?.title ? String(chatSession.title) : '';
  const joinDisplayName = (profile?.name || '').trim() || storedGuestName.trim();
  const guestDisplayName = joinDisplayName || 'Audience';
  const loggedInUid = profile?.guest ? '' : String(profile?.uid || '').trim();
  const chatJoinIdentity: ChatJoinIdentity = {
    uid: loggedInUid || null,
    name: joinDisplayName,
  };

  useLayoutEffect(() => {
    if (isGuest) {
      navigation.setOptions({
        headerShown: false,
        headerRight: () => null,
        tabBarStyle: { display: 'none' },
      });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      headerRight: () => <LogoutButton />,
      tabBarStyle,
    });
  }, [isGuest, navigation, tabBarStyle]);

  useEffect(() => {
    if (!isGuest) return;
    let cancelled = false;
    (async () => {
      const stored = (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() || '';
      if (!cancelled) setStoredGuestName(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  useEffect(() => {
    (async () => {
      const fromParam = String(params.code || '')
        .trim()
        .toUpperCase();
      if (fromParam) {
        setSessionCode(fromParam);
        return;
      }
      const stored = await AsyncStorage.getItem(SESSION_CODE_KEY);
      if (stored) setSessionCode(stored.trim().toUpperCase());
    })();
  }, [params.code]);

  const handleJoinChat = useCallback(
    async (overrideCode?: string) => {
      const codeToUse = (overrideCode || normalizedCode || '').trim().toUpperCase();
      if (!codeToUse) {
        showAlert({
          type: 'warning',
          title: 'Missing code',
          message: 'Enter a session code.',
          primary: { label: 'Close' },
        });
        return;
      }
      if (isJoining) return;

      setIsJoining(true);
      setJoinError('');
      try {
        const storedName = (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() || '';
        const identity: ChatJoinIdentity = {
          uid: profile?.guest ? null : String(profile?.uid || '').trim() || null,
          name: storedName || (profile?.name || '').trim(),
        };
        const nextParticipantId = await resolveParticipantId(codeToUse, identity);
        setParticipantId(nextParticipantId);
        setSessionCode(codeToUse);

        const response = await getChatByCode(codeToUse, nextParticipantId);
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Invalid or inactive chat session code');
        }
        if (isChatSessionEnded(response.data)) {
          setChatId(null);
          setJoinError('This chat has ended and is no longer available.');
          return;
        }
        setChatId(response.data.id);
        await AsyncStorage.setItem(SESSION_CODE_KEY, codeToUse);
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : 'Invalid or inactive chat session code';
        setJoinError(messageText);
        setChatId(null);
      } finally {
        setIsJoining(false);
      }
    },
    [isJoining, normalizedCode, profile?.guest, profile?.uid, profile?.name]
  );

  useEffect(() => {
    if (!normalizedCode || normalizedCode.length !== 6) return;
    if (lastAutoJoinRef.current === normalizedCode) return;
    lastAutoJoinRef.current = normalizedCode;
    handleJoinChat(normalizedCode);
  }, [normalizedCode, handleJoinChat]);

  useEffect(() => {
    if (!normalizedCode) return;
    resolveParticipantId(normalizedCode, chatJoinIdentity).then(setParticipantId);
  }, [normalizedCode, loggedInUid, joinDisplayName]);

  useEffect(() => {
    if (isChatEnded && chatSession) {
      setJoinError('This chat has ended and is no longer available.');
      setMessage('');
      if (!leftOnEndRef.current) {
        leftOnEndRef.current = true;
        leave();
      }
    }
  }, [isChatEnded, chatSession, leave]);

  useEffect(() => {
    if (!showActiveChat || !liveChatId || !participantId) return undefined;

    const sendPresence = () => {
      chatPresence(liveChatId, participantId).catch(() => undefined);
    };
    sendPresence();
    const intervalId = setInterval(sendPresence, 20000);

    return () => {
      clearInterval(intervalId);
      leaveChat(liveChatId, participantId).catch(() => undefined);
    };
  }, [showActiveChat, liveChatId, participantId]);

  useEffect(() => {
    if (!visibleMessages.length) return;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [visibleMessages.length]);

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

  const isOwnStudentMessage = (msg: any) => {
    if (!msg || msg.isTeacher) return false;
    if (!participantId) return false;
    if (msg.participantId) {
      return String(msg.participantId) === String(participantId);
    }
    return false;
  };

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || !chatSession || isChatEnded || !canSendMessages || isSending) return;

    setIsSending(true);
    setMessage('');
    try {
      const pid = participantId || (await resolveParticipantId(normalizedCode, chatJoinIdentity));
      const response = await addChatMessage(chatSession.id, {
        message: trimmed,
        sender: 'Anonymous Audience',
        participantId: pid,
      });
      if (!response.success) {
        showAlert({
          type: 'error',
          title: 'Send failed',
          message: cleanErrorMessage(response.error, 'Failed to send message'),
          primary: { label: 'Close' },
        });
        setMessage(trimmed);
      }
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Send failed',
        message: cleanErrorMessage(error, 'Failed to send message'),
        primary: { label: 'Close' },
      });
      setMessage(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  const showJoinForm = !showActiveChat;

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      {isGuest ? (
        <View style={[styles.guestNavSafe, { paddingTop: insets.top }]}>
          <View style={styles.guestNav}>
            <Pressable
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={styles.guestNavBack}>
              <Ionicons name="arrow-back" size={22} color={COLORS.header} />
            </Pressable>
            <Text style={styles.guestNavBrand} numberOfLines={1}>
              Live Chat
            </Text>
            <View style={styles.guestNavCenter}>
              {chatTitle ? (
                <>
                  <Ionicons name="chatbubble-outline" size={16} color="#6B3A5C" />
                  <Text style={styles.guestNavTitle} numberOfLines={1}>
                    {chatTitle}
                  </Text>
                </>
              ) : null}
            </View>
            <View style={styles.guestNavRight} accessibilityRole="text">
              <Ionicons name="person-outline" size={16} color="#5F5460" />
              <Text style={styles.guestNavName} numberOfLines={1}>
                {guestDisplayName}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {showActiveChat && chatSession?.title ? chatSession.title : 'Anonymous Chat'}
          </Text>
          <Text style={styles.headerSub}>{(profile?.name || 'Audience').trim()}</Text>
        </View>
      )}

      {showJoinForm ? (
        <View
          style={[
            styles.card,
            isGuest && styles.guestCardSpacing,
            isGuest && { marginBottom: guestBottomMargin },
          ]}>
          <Text style={styles.cardTitle}>{isChatEnded ? 'Chat Ended' : 'Join Anonymous Chat'}</Text>
          <Text style={styles.cardBody}>
            {isChatEnded
              ? 'This live chat has ended. Ask your host for a new session code if you still have questions.'
              : 'Enter the session code to join the chat'}
          </Text>
          {joinError ? <Text style={styles.error}>{joinError}</Text> : null}
          {!isChatEnded ? (
            <>
              <TextInput
                value={sessionCode}
                onChangeText={(value) =>
                  setSessionCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                }
                placeholder="Enter 6-character code"
                placeholderTextColor={COLORS.darkTextSecondary}
                autoCapitalize="characters"
                maxLength={6}
                style={styles.codeInput}
                onSubmitEditing={() => handleJoinChat()}
              />
              <TouchableOpacity
                style={[styles.joinBtn, (!sessionCode.trim() || isJoining) && styles.disabled]}
                onPress={() => handleJoinChat()}
                disabled={!sessionCode.trim() || isJoining}>
                {isJoining ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.joinLabel}>Join Chat</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.activeCard,
            isGuest && styles.guestActiveCard,
            isGuest && { marginBottom: guestBottomMargin },
          ]}>
          <View style={styles.statusRow}>
            <Text style={styles.participants}>{participantCount} participants</Text>
            <View style={styles.pill}>
              <View style={[styles.pillDot, canSendMessages ? styles.pillDotOn : styles.pillDotWait]} />
              <Text style={styles.pillText}>
                {canSendMessages
                  ? 'Chat is active - You can send messages'
                  : 'Waiting for host to enable chat...'}
              </Text>
            </View>
          </View>

          <FlatList
            ref={listRef}
            style={styles.messageList}
            data={visibleMessages}
            keyExtractor={(item) => item.id}
            {...KEYBOARD_SCROLL_PROPS}
            contentContainerStyle={styles.messageContent}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {canSendMessages ? 'Be the first to send a message!' : ' '}
              </Text>
            }
            renderItem={({ item }) => {
              const isOwn = isOwnStudentMessage(item);
              const fromTeacher = Boolean(item.isTeacher);
              return (
                <ChatMessageBubble
                  message={item}
                  isOwn={isOwn}
                  label={isOwn ? 'You' : fromTeacher ? 'Host' : 'Audience'}
                  showStudentDot={!isOwn && !fromTeacher}
                />
              );
            }}
          />

          {canSendMessages ? (
            <View style={styles.inputBar}>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Type your message…"
                placeholderTextColor={COLORS.darkTextSecondary}
                style={styles.input}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!message.trim() || isSending) && styles.disabled]}
                onPress={handleSendMessage}
                disabled={!message.trim() || isSending}>
                <Text style={styles.sendLabel}>{isSending ? '…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, width: '100%', backgroundColor: COLORS.cream },
  guestNavSafe: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  guestNav: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  guestNavBack: {
    paddingVertical: 8,
    paddingRight: 4,
  },
  guestNavBrand: {
    flexShrink: 0,
    color: COLORS.header,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  guestNavCenter: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  guestNavTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  guestNavRight: {
    flexShrink: 0,
    maxWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guestNavName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  header: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
  },
  headerTitle: { color: COLORS.text, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  headerSub: { color: COLORS.darkTextSecondary, marginTop: 2 },
  card: {
    margin: SPACING[4],
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[6],
  },
  guestCardSpacing: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  cardBody: {
    marginTop: SPACING[2],
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    marginTop: SPACING[4],
    color: COLORS.warningText,
    backgroundColor: COLORS.warningSoft,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING[3],
  },
  codeInput: {
    marginTop: SPACING[5],
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    minHeight: 52,
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 2,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  joinBtn: {
    marginTop: SPACING[4],
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 16 },
  disabled: { opacity: 0.6 },
  activeCard: {
    flex: 1,
    margin: SPACING[4],
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  guestActiveCard: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
  },
  statusRow: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    gap: SPACING[2],
  },
  participants: { color: COLORS.darkTextSecondary, fontSize: 13 },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.blush,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillDotOn: { backgroundColor: COLORS.primary },
  pillDotWait: { backgroundColor: COLORS.mutedPurple },
  pillText: { color: COLORS.primary, fontSize: 12, fontWeight: FONT_WEIGHTS.medium, flexShrink: 1 },
  messageList: { flex: 1, marginTop: SPACING[2] },
  messageContent: { padding: SPACING[4], paddingBottom: SPACING[6], flexGrow: 1 },
  empty: { textAlign: 'center', color: COLORS.darkTextSecondary, marginTop: SPACING[8] },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[3],
    paddingTop: SPACING[3],
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  sendBtn: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
});
