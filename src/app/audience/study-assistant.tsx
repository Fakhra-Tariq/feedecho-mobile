import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  deleteStudyConversation,
  getStudyConversation,
  listStudyConversations,
  sendStudyAssistantMessage,
  type StudyConversationListItem,
} from '@/lib/studyAssistant';

type UiMessage = {
  id: string;
  text: string;
  sender: 'user' | 'ai';
};

const WELCOME: UiMessage = {
  id: 'welcome',
  text: "Hi! I'm your AI Study Assistant. I can help you with practice questions, explain topics you missed, or help you prepare for quizzes. What would you like to work on today?",
  sender: 'ai',
};

export default function StudyAssistantScreen() {
  const { user, profile } = useAuth();
  const studentId = String(user?.uid || profile?.uid || '').trim();
  const [tab, setTab] = useState<'chat' | 'history'>('chat');
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<StudyConversationListItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadHistory = useCallback(async () => {
    if (!studentId) return;
    setLoadingHistory(true);
    try {
      setHistory(await listStudyConversations(studentId));
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  const startNewChat = () => {
    setConversationId(null);
    setMessages([WELCOME]);
    setTab('chat');
    setInput('');
  };

  const openConversation = async (id: string) => {
    if (!studentId) return;
    try {
      const conv = await getStudyConversation(id, studentId);
      const mapped: UiMessage[] = (conv?.messages || []).map((m, index) => ({
        id: `msg-${index}-${m.timestamp || index}`,
        text: m.text,
        sender: m.role === 'assistant' ? 'ai' : 'user',
      }));
      setConversationId(id);
      setMessages(mapped.length ? mapped : [WELCOME]);
      setTab('chat');
    } catch {
      setMessages([WELCOME]);
    }
  };

  const onDelete = async (id: string) => {
    if (!studentId) return;
    await deleteStudyConversation(id, studentId).catch(() => undefined);
    await loadHistory();
    if (conversationId === id) startNewChat();
  };

  const onSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    if (!studentId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          text: 'Please sign in with email or Google to use the study assistant.',
          sender: 'ai',
        },
      ]);
      return;
    }

    const userMsg: UiMessage = { id: `user-${Date.now()}`, text: trimmed, sender: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const response = await sendStudyAssistantMessage({
        studentId,
        message: trimmed,
        conversationId,
      });
      const data = response.data || {};
      if (!data.reply) throw new Error(response.error || 'No assistant reply received');
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, text: data.reply!, sender: 'ai' },
      ]);
    } catch (error) {
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          text:
            error instanceof Error
              ? error.message
              : 'Something went wrong, please try again.',
          sender: 'ai',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (tab !== 'chat') return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvt, () => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => {
      showSub.remove();
    };
  }, [tab]);

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.heading}>AI Study Assistant</Text>
          <Text style={styles.hint}>Ask anything about your studies</Text>
        </View>
        <TouchableOpacity onPress={startNewChat} style={styles.newBtn} accessibilityRole="button">
          <Ionicons name="create-outline" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(['chat', 'history'] as const).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>
              {key === 'chat' ? 'Chat' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'history' ? (
        loadingHistory ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING[8] }} />
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.conversationId}
            style={styles.flexList}
            {...KEYBOARD_SCROLL_PROPS}
            contentContainerStyle={styles.historyList}
            ListEmptyComponent={
              <Text style={styles.empty}>No saved conversations yet.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.historyRow}>
                <TouchableOpacity style={styles.historyMain} onPress={() => openConversation(item.conversationId)}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.title || 'Conversation'}
                  </Text>
                  {item.lastMessageAt ? (
                    <Text style={styles.meta}>
                      {new Date(item.lastMessageAt).toLocaleString()}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item.conversationId)}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.dangerText} />
                </TouchableOpacity>
              </View>
            )}
          />
        )
      ) : (
        <View style={styles.chatPane}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.flexList}
            {...KEYBOARD_SCROLL_PROPS}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.sender === 'user' ? styles.bubbleUser : styles.bubbleAi,
                ]}>
                <Text
                  style={[
                    styles.bubbleText,
                    item.sender === 'user' && styles.bubbleTextUser,
                  ]}>
                  {item.text}
                </Text>
              </View>
            )}
          />
          {sending ? (
            <Text style={styles.typing}>Assistant is typing…</Text>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask a study question…"
              placeholderTextColor={COLORS.darkTextSecondary}
              style={styles.input}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendDisabled]}
              onPress={onSend}
              disabled={!input.trim() || sending}>
              <Ionicons name="send" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  chatPane: { flex: 1 },
  flexList: { flex: 1 },
  header: {
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  headerCopy: { flex: 1 },
  heading: { ...TYPE.title },
  hint: { ...TYPE.subtitle, marginTop: SPACING[1] },
  newBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: SPACING[6],
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  tabActive: { backgroundColor: COLORS.white },
  tabLabel: { color: COLORS.darkTextSecondary, fontWeight: FONT_WEIGHTS.medium },
  tabLabelActive: { color: COLORS.primary },
  chatList: { padding: SPACING[6], gap: SPACING[3], paddingBottom: SPACING[4] },
  bubble: {
    maxWidth: '86%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bubbleText: { color: COLORS.text, fontSize: 15, lineHeight: 21 },
  bubbleTextUser: { color: COLORS.white },
  typing: {
    paddingHorizontal: SPACING[6],
    color: COLORS.darkTextSecondary,
    marginBottom: SPACING[2],
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING[2],
    padding: SPACING[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.white,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  historyList: { padding: SPACING[6], gap: SPACING[3] },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyMain: { flex: 1 },
  historyTitle: { ...TYPE.bodyStrong },
  meta: { ...TYPE.caption, marginTop: 2 },
  empty: { ...TYPE.subtitle, textAlign: 'center', marginTop: SPACING[10] },
});
