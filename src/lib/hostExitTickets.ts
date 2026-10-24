import { apiRequest } from '@/lib/api';

export const LIKERT_OPTIONS = [
  'Strongly Agree',
  'Agree',
  'Neutral',
  'Disagree',
  'Strongly Disagree',
] as const;

export const QUESTION_TYPE_CATALOG = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'likert', label: 'Likert Scale' },
  { value: 'true_false', label: 'True / False' },
] as const;

export type ExitQuestionType = (typeof QUESTION_TYPE_CATALOG)[number]['value'];

export type ExitQuestion = {
  prompt: string;
  type: ExitQuestionType | string;
  options?: string[];
};

export type ExitTicket = {
  id: string;
  title?: string;
  status?: string;
  responsesCount?: number;
  collectAttendance?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  joinCode?: string;
  sessionCode?: string;
  startedAt?: string;
  endedAt?: string;
  previousStatus?: string;
  questions?: ExitQuestion[];
};

export type ExitResponse = {
  id: string;
  ticketId?: string;
  studentName?: string;
  answers?: { questionIndex: number; answer: string }[];
  submittedAt?: string;
  studentUid?: string;
  studentEmail?: string;
};

export function emptyQuestion(): ExitQuestion {
  return { prompt: '', type: 'short_text', options: [] };
}

/** Same normalization Web uses so Edit never opens an empty form. */
export function normalizeLoadedQuestion(question: any): ExitQuestion {
  const rawType = String(question?.type || 'short_text')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const type =
    rawType === 'shorttext'
      ? 'short_text'
      : rawType === 'multiplechoice' || rawType === 'mcq'
        ? 'multiple_choice'
        : rawType === 'truefalse' || rawType === 'true/false'
          ? 'true_false'
          : rawType;
  const options = Array.isArray(question?.options)
    ? question.options.map((option: any) =>
        typeof option === 'string' ? option : option?.text || option?.label || ''
      )
    : [];

  return {
    prompt: question?.prompt || question?.text || question?.question || '',
    type: QUESTION_TYPE_CATALOG.some((item) => item.value === type) ? type : 'short_text',
    options: type === 'multiple_choice' && options.length === 0 ? ['', ''] : options,
  };
}

export function displayTicketStatus(status?: string) {
  return status === 'archived' ? 'ended' : status || 'draft';
}

export function questionsForTicket(
  questionsTree: Record<string, any> | null | undefined,
  ticketId: string,
  fallback: ExitQuestion[] = []
) {
  if (!ticketId || !questionsTree) return fallback;
  const raw = questionsTree[ticketId];
  if (raw == null) return fallback;
  if (Array.isArray(raw)) {
    const list = raw.filter(Boolean);
    return list.length ? list : fallback;
  }
  if (typeof raw !== 'object') return fallback;
  const list = Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => raw[k])
    .filter(Boolean);
  return list.length ? list : fallback;
}

/** Same count Web ExitTicketDashboard cards use: questions array length. */
export function ticketQuestionCount(ticket: ExitTicket) {
  if (Array.isArray(ticket.questions) && ticket.questions.length > 0) {
    return ticket.questions.length;
  }
  const stored = Number((ticket as { questionCount?: number }).questionCount);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return ticket.questions === undefined ? null : 0;
}

export function attachQuestionsToTickets(
  ticketList: ExitTicket[],
  questionsTree: Record<string, any> | null | undefined,
  existingById: Record<string, ExitTicket> = {}
) {
  return ticketList.map((t) => {
    let questions = questionsForTicket(
      questionsTree,
      t.id,
      existingById[t.id]?.questions || t.questions || []
    );
    if ((!questions || questions.length === 0) && Array.isArray(t.questions) && t.questions.length) {
      questions = t.questions;
    }
    return { ...t, questions };
  });
}

export async function listExitTickets() {
  const response = await apiRequest<{ success: boolean; data: ExitTicket[] }>('/exit-tickets');
  if (!response.success) throw new Error('Failed to load exit tickets');
  return response.data || [];
}

export async function getExitTicketById(id: string) {
  const response = await apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    `/exit-tickets/${id}`
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Exit ticket not found');
  }
  return response.data;
}

export async function createExitTicket(payload: Record<string, unknown>) {
  const response = await apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    '/exit-tickets',
    { method: 'POST', body: payload }
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to create exit ticket');
  }
  return response.data;
}

export async function updateExitTicket(id: string, payload: Record<string, unknown>) {
  const response = await apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    `/exit-tickets/${id}`,
    { method: 'PUT', body: payload }
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update exit ticket');
  }
  return response.data;
}

export async function deleteExitTicket(id: string) {
  const response = await apiRequest<{ success: boolean; error?: string }>(`/exit-tickets/${id}`, {
    method: 'DELETE',
  });
  if (!response.success) throw new Error(response.error || 'Failed to delete exit ticket');
}

export async function startExitTicket(id: string) {
  const response = await apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    `/exit-tickets/${id}/start`,
    { method: 'POST' }
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to launch exit ticket');
  }
  return response.data;
}

export async function endExitTicket(id: string) {
  const response = await apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    `/exit-tickets/${id}/end`,
    { method: 'POST' }
  );
  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to end exit ticket');
  }
  return response.data;
}

export async function archiveExitTicket(id: string) {
  return updateExitTicket(id, { status: 'archived' });
}

/** GET /exit-tickets/:id/responses returns `{ responses, attendance, summary }`, not a bare array. */
export function normalizeExitResponsesPayload(data: unknown): ExitResponse[] {
  if (Array.isArray(data)) return data as ExitResponse[];
  if (data && typeof data === 'object') {
    const nested = (data as { responses?: unknown }).responses;
    if (Array.isArray(nested)) return nested as ExitResponse[];
    if (nested && typeof nested === 'object') {
      return Object.values(nested as Record<string, ExitResponse>);
    }
  }
  return [];
}

export async function getExitTicketResponses(id: string) {
  const response = await apiRequest<{ success: boolean; data: unknown; error?: string }>(
    `/exit-tickets/${id}/responses`
  );
  if (!response.success) throw new Error(response.error || 'Failed to load responses');
  return normalizeExitResponsesPayload(response.data);
}

export async function getExitTicketByCode(joinCode: string) {
  return apiRequest<{ success: boolean; data: ExitTicket; error?: string }>(
    `/exit-tickets/code/${encodeURIComponent(joinCode)}`,
    { auth: false }
  );
}

export async function submitExitTicketResponse(
  id: string,
  responseData: {
    ticketId: string;
    studentName: string;
    answers: { questionIndex: number; answer: string }[];
    studentUid?: string;
    studentEmail?: string;
  }
) {
  return apiRequest<{ success: boolean; error?: string }>(`/exit-tickets/${id}/respond`, {
    method: 'POST',
    body: responseData,
    auth: false,
  });
}

export function buildTicketPayload(form: {
  title: string;
  collectAttendance: boolean;
  questions: ExitQuestion[];
}) {
  return {
    title: form.title.trim(),
    collectAttendance: form.collectAttendance,
    questions: form.questions.map((q) => ({
      prompt: q.prompt.trim(),
      type: q.type,
      options:
        q.type === 'multiple_choice'
          ? (q.options || []).filter((opt) => opt.trim())
          : q.type === 'likert'
            ? [...LIKERT_OPTIONS]
            : [],
    })),
    status: 'draft',
  };
}

export function validateTicketForm(form: {
  title: string;
  questions: ExitQuestion[];
}) {
  if (!form.title.trim()) return 'Title is required.';
  if (!form.questions.length) return 'At least one question is required.';
  if (form.questions.some((q) => !q.prompt.trim())) return 'All questions must have a prompt.';
  if (
    form.questions.some(
      (q) =>
        q.type === 'multiple_choice' && (q.options || []).filter((opt) => opt.trim()).length < 2
    )
  ) {
    return 'Multiple choice questions must have at least 2 options.';
  }
  return null;
}
