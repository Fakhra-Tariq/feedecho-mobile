import { apiRequest } from '@/lib/api';

export type StudyMessage = {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
};

export type StudyConversationListItem = {
  conversationId: string;
  title?: string;
  lastMessageAt?: string | null;
};

export type StudyConversation = {
  conversationId: string;
  studentId?: string;
  title?: string;
  messages?: StudyMessage[];
  createdAt?: string | null;
};

/** RTDB path used by the server: studyAssistantConversations/{conversationId} */
export const STUDY_ASSISTANT_COLLECTION = 'studyAssistantConversations';

export async function listStudyConversations(studentId: string) {
  const qs = `?studentId=${encodeURIComponent(studentId)}`;
  const response = await apiRequest<{ success?: boolean; data?: StudyConversationListItem[] }>(
    `/study-assistant/conversations${qs}`,
    { auth: false }
  );
  return response.data || [];
}

export async function getStudyConversation(conversationId: string, studentId: string) {
  const qs = `?studentId=${encodeURIComponent(studentId)}`;
  const response = await apiRequest<{ success?: boolean; data?: StudyConversation }>(
    `/study-assistant/conversations/${encodeURIComponent(conversationId)}${qs}`,
    { auth: false }
  );
  return response.data || null;
}

export async function deleteStudyConversation(conversationId: string, studentId: string) {
  const qs = `?studentId=${encodeURIComponent(studentId)}`;
  return apiRequest(`/study-assistant/conversations/${encodeURIComponent(conversationId)}${qs}`, {
    method: 'DELETE',
    auth: false,
  });
}

export async function sendStudyAssistantMessage(input: {
  studentId: string;
  message: string;
  conversationId?: string | null;
}) {
  return apiRequest<{
    success?: boolean;
    data?: { conversationId?: string; reply?: string; title?: string };
    error?: string;
  }>('/study-assistant/chat', {
    method: 'POST',
    auth: false,
    body: {
      studentId: input.studentId,
      message: input.message,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    },
  });
}
