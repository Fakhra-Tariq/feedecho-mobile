import { apiRequest } from '@/lib/api';

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
};

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
  return response.data;
}

export async function getChatByCode(joinCode: string, participantId?: string) {
  const qs = participantId ? `?participantId=${encodeURIComponent(participantId)}` : '';
  return apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/code/${encodeURIComponent(joinCode)}${qs}`,
    { auth: false }
  );
}

export async function addChatMessage(
  chatId: string,
  messageData: { message: string; sender?: string; participantId?: string },
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
    auth: false,
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
  return response.data;
}

export async function endAnonymousChat(chatId: string) {
  const response = await apiRequest<{ success: boolean; data: ChatSession; error?: string }>(
    `/anonymous-chats/${chatId}/end`,
    { method: 'PUT' }
  );
  if (!response.success) throw new Error(response.error || 'Failed to end chat');
  return response.data;
}

export async function deleteAnonymousChat(chatId: string) {
  const response = await apiRequest<{ success: boolean; error?: string }>(
    `/anonymous-chats/${chatId}`,
    { method: 'DELETE' }
  );
  if (!response.success) throw new Error(response.error || 'Failed to delete chat');
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

/** Same id format as Web: `student-{timestamp}-{rand}`. */
export function getOrCreateChatParticipantId(_sessionCode?: string) {
  return `student-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
