import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudienceActivityHeader } from '@/components/Audience/AudienceActivityHeader';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';
import { showAlert } from '@/components/feedback';
import {
  KEYBOARD_SCROLL_PROPS,
  KeyboardBottomAnchor,
  KeyboardSafeScreen,
  useKeyboardInset,
} from '@/components/KeyboardSafeScreen';
import { StudentAccountButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { useLeaveActivity } from '@/lib/audienceHomeNavigation';
import {
  addChatMessage,
  audienceMessageLabel,
  chatPresence,
  getChatByCode,
  isChatNamesVisible,
  isChatSessionEnded,
  isNamedAudienceMessage,
  leaveChat,
  readLegacyChatParticipantId,
  resolveChatParticipantId,
  type ChatJoinIdentity,
} from '@/lib/anonymousChat';
import { recordLiveChatActivityJoin } from '@/lib/liveChatActivity';
import { useBottomSpace } from '@/lib/tabBarSafeArea';
import { toParticipantCount } from '@/lib/toParticipantCount';
import { useRtdbList, useRtdbValue } from '@/lib/useRtdb';

const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';


export default function AudienceLiveChatScreen() {
  const { profile, user } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const isGuest = Boolean(profile?.guest);
  const { leave } = useLeaveActivity({ headerBack: false });
  const leftOnEndRef = useRef(false);

  const [sessionCode, setSessionCode] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState('');
  const [legacyParticipantId, setLegacyParticipantId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [storedGuestName, setStoredGuestName] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputBarRef = useRef<any>(null);
  const lastAutoJoinRef = useRef<string | null>(null);
  const keyboardInset = useKeyboardInset();
  // Stack screen (no tab bar). Guest already padded the card; logged-in did not,
  // so the composer sat under the Android nav bar.
  const cardBottomSpace = useBottomSpace({ keyboardOpen });

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
  const loggedInUid = profile?.guest
    ? ''
    : String(user?.uid || profile?.uid || '').trim();
  const chatJoinIdentity: ChatJoinIdentity = {
    uid: loggedInUid || null,
    name: joinDisplayName,
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      headerBackVisible: false,
      headerLeft: () => null,
      headerRight: () => null,
    });
  }, [navigation]);

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
          uid: profile?.guest ? null : String(user?.uid || profile?.uid || '').trim() || null,
          name: storedName || (profile?.name || '').trim(),
        };
        const nextParticipantId = await resolveChatParticipantId(codeToUse, identity);
        setParticipantId(nextParticipantId);
        const legacyId = await readLegacyChatParticipantId(codeToUse, identity);
        setLegacyParticipantId(legacyId);
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
        const studentUid = profile?.guest ? '' : String(profile?.uid || '').trim();
        if (studentUid && response.data.id) {
          void recordLiveChatActivityJoin({
            studentUid,
            studentEmail: String(profile?.email || '').trim() || null,
            studentName: identity.name || null,
            chatId: String(response.data.id),
            title: response.data.title,
          }).catch((error) => {
            console.warn('[LiveChat activity] failed to record join', error);
          });
        }
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : 'Invalid or inactive chat session code';
        setJoinError(messageText);
        setChatId(null);
      } finally {
        setIsJoining(false);
      }
    },
    [isJoining, normalizedCode, profile?.guest, profile?.uid, profile?.email, profile?.name, user?.uid]
  );

  useEffect(() => {
    if (!normalizedCode || normalizedCode.length !== 6) return;
    if (lastAutoJoinRef.current === normalizedCode) return;
    lastAutoJoinRef.current = normalizedCode;
    handleJoinChat(normalizedCode);
  }, [normalizedCode, handleJoinChat]);

  useEffect(() => {
    if (!normalizedCode) return;
    resolveChatParticipantId(normalizedCode, chatJoinIdentity).then(setParticipantId);
    readLegacyChatParticipantId(normalizedCode, chatJoinIdentity).then(setLegacyParticipantId);
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
    const showSub = Keyboard.addListener(showEvt, (event) => {
      setKeyboardOpen(true);
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      // TEMP DEBUG — remove after Guest Live Chat composer is fully above Gboard
      const coords = event?.endCoordinates;
      requestAnimationFrame(() => {
        inputBarRef.current?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          const inputBottom = Math.round(y + h);
          const kbTop = Math.round(coords?.screenY || 0);
          console.log('[TEMP DEBUG] Guest Live Chat keyboard', {
            isGuest,
            kbEventHeight: coords?.height,
            kbEventScreenY: coords?.screenY,
            windowH: Dimensions.get('window').height,
            screenH: Dimensions.get('screen').height,
            topInset: insets.top,
            bottomInset: insets.bottom,
            cardBottomSpace,
            overlap: keyboardInset.overlap,
            composerPadApplied: keyboardInset.overlap > 0 ? keyboardInset.overlap + 12 : 0,
            inputBottom,
            hiddenBehindKeyboardPx: Math.max(0, inputBottom - kbTop),
            gapAboveKeyboardPx: kbTop - inputBottom,
            guestHeaderApprox: isGuest ? insets.top + 48 : 0,
            tabBarHeight: 0,
          });
        });
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
    const stored = String(msg.participantId || '');
    if (!stored) return false;
    if (loggedInUid && stored === String(loggedInUid)) return true;
    if (legacyParticipantId && stored === String(legacyParticipantId)) return true;
    if (participantId && stored === String(participantId)) return true;
    return false;
  };

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || !chatSession || isChatEnded || !canSendMessages || isSending) return;

    setIsSending(true);
    setMessage('');
    try {
      const pid = participantId || (await resolveChatParticipantId(normalizedCode, chatJoinIdentity));
      const namesVisible = isChatNamesVisible(chatSession);
      const senderName = String(joinDisplayName || '').trim().slice(0, 80);
      const payload: {
        message: string;
        sender: string;
        participantId: string;
        showName: boolean;
        senderName?: string;
      } = {
        message: trimmed,
        sender: 'Anonymous Audience',
        participantId: pid,
        showName: namesVisible,
      };
      if (namesVisible && senderName) {
        payload.senderName = senderName;
      }
      const response = await addChatMessage(chatSession.id, payload);
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
      <AudienceActivityHeader
        activityLabel="Live Chat"
        title={chatTitle || 'Live Chat'}
        participantName={guestDisplayName}
        isLoggedIn={!isGuest}
        rightSlot={isGuest ? undefined : <StudentAccountButton />}
      />
      <GuestProgressLoginBanner visible={isGuest} />

      {showJoinForm ? (
        <View
          style={[
            styles.card,
            isGuest && styles.guestCardSpacing,
            !isGuest && styles.studentCardSpacing,
            { marginBottom: cardBottomSpace },
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
              <KeyboardBottomAnchor>
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
              </KeyboardBottomAnchor>
            </>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.activeCard,
            isGuest && styles.guestActiveCard,
            !isGuest && styles.studentActiveCard,
            { marginBottom: cardBottomSpace },
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
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={48} color="#D1D5DB" />
                {canSendMessages ? (
                  <Text style={styles.empty}>Be the first to send a message!</Text>
                ) : null}
              </View>
            }
            renderItem={({ item }) => {
              const isOwn = isOwnStudentMessage(item);
              const fromTeacher = Boolean(item.isTeacher);
              return (
                <ChatMessageBubble
                  message={item}
                  isOwn={isOwn}
                  label={isOwn ? 'You' : fromTeacher ? 'Host' : audienceMessageLabel(item)}
                  namedSender={isNamedAudienceMessage(item, { isOwn, fromTeacher })}
                  showStudentDot={!isOwn && !fromTeacher}
                />
              );
            }}
          />

          {canSendMessages ? (
            <KeyboardBottomAnchor ref={inputBarRef} style={styles.inputBar}>
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
            </KeyboardBottomAnchor>
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
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  navSide: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  navSideRight: {
    alignItems: 'flex-end',
  },
  guestNavBrand: {
    flexShrink: 0,
    color: COLORS.header,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  guestNavCenter: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  guestNavTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  guestNavRight: {
    maxWidth: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  guestNavName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
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
  studentCardSpacing: {
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
  studentActiveCard: {
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
  emptyWrap: { alignItems: 'center', paddingVertical: 32 },
  empty: { textAlign: 'center', color: COLORS.darkTextSecondary, marginTop: SPACING[4] },
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
