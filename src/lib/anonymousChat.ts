import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiRequest } from '@/lib/api';
import { notifyHostDataMutated } from '@/lib/hostDataSync';

export type ChatSession = {
  id: string;
  title?: string;
  description?: string;
  joinCode?: string;
  sessionCode?: string;
  status?: string;
  isActive?: boolean;
  chatEnabled?: boolean;
  moderationMode?: boolean;
  namesVisible?: boolean;
  createdBy?: string | null;
  createdAt?: string;
  lastActivity?: string;
  updatedAt?: string;
  endedAt?: string;
  participants?: number | Record<string, unknown>;
  messageCount?: number;
  settings?: {
    allowQuestions?: boolean;
    allowComments?: boolean;
    autoModerate?: boolean;
    profanityFilter?: boolean;
    moderationMode?: boolean;
    namesVisible?: boolean;
  };
  messages?: ChatMessage[];
};

export type ChatMessage = {
  id: string;
  sender?: string;
  message?: string;
  content?: string;
  timestamp?: string;
  isTeacher?: boolean;
  isAnswered?: boolean;
  isHidden?: boolean;
  participantId?: string;
  showName?: boolean;
  senderName?: string;
  type?: string;
  resourceId?: string;
  resourceKind?: 'file' | 'image' | 'link' | string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDomain?: string;
};

/** Same as Web: chat.namesVisible or settings.namesVisible. */
export function isChatNamesVisible(chat: ChatSession | null | undefined) {
  return Boolean(chat?.namesVisible || chat?.settings?.namesVisible);
}

/** Message-owned label. Missing showName → Audience. Never use the live toggle. */
export function audienceMessageLabel(message: ChatMessage | null | undefined) {
  if (message?.showName === true) {
    const name = String(message.senderName || '').trim();
    if (name) return name;
  }
  return 'Audience';
}

export function isNamedAudienceMessage(
  message: ChatMessage | null | undefined,
  opts?: { isOwn?: boolean; fromTeacher?: boolean }
) {
  if (!message || opts?.fromTeacher || opts?.isOwn) return false;
  return message.showName === true && Boolean(String(message.senderName || '').trim());
}

export function isChatActive(chat: ChatSession | null | undefined) {
  if (!chat) return false;
  return chat.status === 'active' || (chat.status == null && chat.isActive !== false);
}

export function isChatSessionEnded(session: ChatSession | null | undefined) {
  return Boolean(session && (session.status === 'ended' || session.isActive === false));
}

export async function listAnonymousChats() {
  const response = await apiRequest<{ success: boolean; data: ChatSession[] }>('/anonymous-chats');
  if (!response.success) throw new Error('Failed to load chats');
  return response.data || [];
}

export async function createAnonymousChat(payload: {
  title: string;
  description?: string;
  settings?: ChatSession['settings'];
}) {
  const response = await apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    '/anonymous-chats/create',
    {
      method: 'POST',
      body: {
        title: payload.title,
        description: payload.description || '',
        settings: {
          allowQuestions: true,
          allowComments: true,
          autoModerate: false,
          profanityFilter: true,
          moderationMode: false,
          ...payload.settings,
        },
      },
    }
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to create chat session');
  }
  notifyHostDataMutated();
  return response.data;
}

export async function getChatByCode(joinCode: string, participantId?: string) {
  const qs = participantId ? `?participantId=${encodeURIComponent(participantId)}` : '';
  return apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/code/${encodeURIComponent(joinCode)}${qs}`,
    { auth: 'optional' }
  );
}

export async function addChatMessage(
  chatId: string,
  messageData: {
    message: string;
    sender?: string;
    participantId?: string;
    showName?: boolean;
    senderName?: string;
  },
  asTeacher = false
) {
  return apiRequest<{ success: boolean; data?: ChatMessage; error?: string }>(
    `/anonymous-chats/${chatId}/messages`,
    {
      method: 'POST',
      body: asTeacher ? { ...messageData, asTeacher: true } : messageData,
      auth: asTeacher,
    }
  );
}

export async function chatPresence(chatId: string, participantId: string) {
  return apiRequest(`/anonymous-chats/${chatId}/presence`, {
    method: 'POST',
    body: { participantId },
    auth: 'optional',
  });
}

export async function leaveChat(chatId: string, participantId: string) {
  return apiRequest(`/anonymous-chats/${chatId}/leave`, {
    method: 'POST',
    body: { participantId },
    auth: false,
  });
}

export async function syncChatStats(chatId: string) {
  return apiRequest(`/anonymous-chats/${chatId}/sync-stats`, { method: 'POST' });
}

export async function toggleChatModeration(chatId: string, moderationMode: boolean) {
  const response = await apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/${chatId}/toggle-moderation`,
    { method: 'PUT', body: { moderationMode } }
  );
  if (!response.success) throw new Error(response.error || 'Failed to toggle moderation');
  notifyHostDataMutated();
  return response.data;
}

/** Same endpoint/fields as Web PUT /anonymous-chats/:id/toggle-names. */
export async function toggleChatNamesVisible(chatId: string, namesVisible: boolean) {
  const response = await apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/${chatId}/toggle-names`,
    { method: 'PUT', body: { namesVisible } }
  );
  if (!response.success) throw new Error(response.error || 'Failed to toggle names visibility');
  notifyHostDataMutated();
  return response.data;
}

export async function endAnonymousChat(chatId: string) {
  const response = await apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/${chatId}/end`,
    { method: 'PUT' }
  );
  if (!response.success) throw new Error(response.error || 'Failed to end chat');
  notifyHostDataMutated();
  return response.data;
}

export async function deleteAnonymousChat(chatId: string) {
  const response = await apiRequest<{ success: boolean; error?: string }>(
    `/anonymous-chats/${chatId}`,
    { method: 'DELETE' }
  );
  if (!response.success) throw new Error(response.error || 'Failed to delete chat');
  notifyHostDataMutated();
}

export type ChatJoinIdentity = {
  uid?: string | null;
  name?: string | null;
};

export function normalizeChatDisplayName(name: string | null | undefined) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Same id format as Web guests: `student-{timestamp}-{rand}`. */
export function mintGuestChatParticipantId() {
  return `student-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Logged-in: Firebase auth uid (same on every device). Guests: mint student-*.
 * Mirrors Web AudienceAnonymousChat getOrCreateChatParticipantId.
 */
export function getOrCreateChatParticipantId(
  identityOrUid?: ChatJoinIdentity | string | null,
  accountUid?: string | null
) {
  const fromObject =
    identityOrUid && typeof identityOrUid === 'object'
      ? String(identityOrUid.uid || '').trim()
      : String(identityOrUid || '').trim();
  const uid = fromObject || String(accountUid || '').trim();
  if (uid) return uid;
  return mintGuestChatParticipantId();
}

/** Logged-in → uid (do not store). Guest → AsyncStorage student-* keyed by code+name. */
export async function resolveChatParticipantId(
  sessionCode: string,
  identity: ChatJoinIdentity
) {
  const uid = String(identity?.uid || '').trim();
  if (uid) return uid;
  const key = chatParticipantStorageKey(sessionCode, { name: identity?.name });
  if (!key) return mintGuestChatParticipantId();
  const existing = await AsyncStorage.getItem(key);
  if (existing) return existing;
  const next = mintGuestChatParticipantId();
  await AsyncStorage.setItem(key, next);
  return next;
}

/**
 * Old app versions stored student-* under the uid-keyed chat storage key.
 * Keep that value for isOwn only; never send or join with it when logged in.
 */
export async function readLegacyChatParticipantId(
  sessionCode: string,
  identity: ChatJoinIdentity
) {
  const uid = String(identity?.uid || '').trim();
  if (!uid) return '';
  const key = chatParticipantStorageKey(sessionCode, { uid, name: identity?.name });
  if (!key) return '';
  const stored = String((await AsyncStorage.getItem(key)) || '').trim();
  if (!stored || stored === uid) return '';
  return stored;
}

/**
 * Same scheme as Web AudienceAnonymousChat:
 * - logged-in: `chatParticipant_${CODE}_uid_${uid}`
 * - guest: `chatParticipant_${CODE}_name_${normalizedName}`
 * Do not reuse the legacy `chatParticipant_${CODE}` key (shared across names).
 */
export function chatParticipantStorageKey(
  sessionCode: string,
  identity?: ChatJoinIdentity | null
) {
  const code = String(sessionCode || '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  const uid = String(identity?.uid || '').trim();
  if (uid) return `chatParticipant_${code}_uid_${uid}`;
  const nameKey = normalizeChatDisplayName(identity?.name);
  if (!nameKey) return null;
  return `chatParticipant_${code}_name_${nameKey}`;
}
