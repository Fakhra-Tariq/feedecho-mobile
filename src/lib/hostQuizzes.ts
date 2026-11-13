import {
  onValue,
  ref,
  update,
} from 'firebase/database';

import { db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';
import { normalizeQuizTypeLabel, type QuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import { isQuizCurrentlyActive, isQuizExpired } from '@/lib/quizExpiry';

export type HostQuiz = {
  id: string;
  title: string;
  type: QuizTypeLabel | string;
  description?: string;
  questions?: any[];
  questionCount?: number;
  status?: string;
  launched?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  launchSettings?: any;
  source?: string;
  accessCode?: string;
};

export const QUIZ_TIME_MIN_MINUTES = 1;
export const QUIZ_TIME_MAX_MINUTES = 180;
export const QUIZ_TIME_PRESETS = [10, 15, 30, 45, 60];

export function parseOptionalMinutes(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < QUIZ_TIME_MIN_MINUTES) return null;
  return Math.min(QUIZ_TIME_MAX_MINUTES, parsed);
}

/** Quizzes just POSTed/PUTted this session — GET /quizzes can lag the createdBy index. */
const savedQuizCache = new Map<string, HostQuiz>();

function asHostQuiz(quiz: HostQuiz, fallbackId = ''): HostQuiz {
  return {
    ...quiz,
    id: String(quiz.id || fallbackId),
    type: normalizeQuizTypeLabel(quiz.type),
  };
}

export function rememberSavedQuiz(quiz: HostQuiz | null | undefined) {
  if (!quiz?.id) return;
  savedQuizCache.set(String(quiz.id), asHostQuiz(quiz));
}

export function forgetSavedQuiz(id: string) {
  savedQuizCache.delete(id);
}

export function mergeTeacherQuizLists(...lists: HostQuiz[][]) {
  const map = new Map<string, HostQuiz>();
  lists.flat().forEach((quiz) => {
    if (!quiz) return;
    const id = String(quiz.id || '');
    if (!id) return;
    const next = asHostQuiz(quiz, id);
    const prev = map.get(id);
    map.set(id, prev ? { ...prev, ...next, id } : next);
  });
  return Array.from(map.values())
    .filter((quiz) => {
      if (quiz.deletedAt) return false;
      return String(quiz.status || '').toLowerCase() !== 'ended';
    })
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );
}

export function subscribeTeacherQuizzes(
  teacherId: string,
  onChange: (quizzes: HostQuiz[]) => void,
  onError?: (error: Error) => void
) {
  // Full-tree listen + client filter (same pattern as working Exit Tickets).
  // Indexed orderByChild('createdBy') often fails silently under client rules.
  const quizzesRef = ref(db, 'quizzes');
  return onValue(
    quizzesRef,
    (snap) => {
      const rows: HostQuiz[] = [];
      if (snap.exists()) {
        Object.entries(snap.val() || {}).forEach(([id, value]) => {
          if (!value || typeof value !== 'object') return;
          const quiz = value as HostQuiz;
          if (String(quiz.createdBy || '').trim() !== String(teacherId || '').trim()) return;
          if (quiz.deletedAt) return;
          const status = String(quiz.status || '').toLowerCase();
          if (status === 'ended') return;
          rows.push({
            ...quiz,
            id: quiz.id || id,
            type: normalizeQuizTypeLabel(quiz.type),
          });
        });
      }
      onChange(mergeTeacherQuizLists(rows, Array.from(savedQuizCache.values())));
    },
    (error) => onError?.(error)
  );
}

/** Same source Web Quiz Library uses: GET /api/quizzes (Admin already filters by token uid). */
export async function listTeacherQuizzes(_teacherId?: string) {
  const response = await apiRequest<{ success?: boolean; data?: HostQuiz[] }>('/quizzes');
  const rows = Array.isArray(response.data) ? response.data : [];
  return mergeTeacherQuizLists(rows, Array.from(savedQuizCache.values()));
}

export async function createQuiz(payload: Record<string, unknown>) {
  const response = await apiRequest<{ success: boolean; data: HostQuiz }>('/quizzes', {
    method: 'POST',
    body: {
      ...payload,
      createdAt: payload.createdAt || new Date().toISOString(),
    },
  });
  if (!response.success || !response.data?.id) {
    throw new Error('Failed to create quiz');
  }
  rememberSavedQuiz(response.data);
  return response.data;
}

export async function updateQuiz(id: string, payload: Record<string, unknown>) {
  const response = await apiRequest<{ success: boolean; data: HostQuiz }>(`/quizzes/${id}`, {
    method: 'PUT',
    body: payload,
  });
  if (!response.success || !response.data?.id) {
    throw new Error('Failed to update quiz');
  }
  rememberSavedQuiz(response.data);
  return response.data;
}

export async function getQuizById(id: string) {
  const response = await apiRequest<{ success: boolean; data: HostQuiz }>(`/quizzes/${id}`);
  if (!response.success || !response.data) {
    throw new Error('Quiz not found');
  }
  return response.data;
}

export async function finishQuiz(id: string) {
  const response = await apiRequest<{ success: boolean }>(`/quizzes/${id}/finish`, {
    method: 'POST',
  });
  if (!response.success) throw new Error('Failed to finish quiz');
}

/** Soft-delete — same as Web Quiz Library (keeps audience reports). */
export async function deleteQuiz(id: string) {
  const response = await apiRequest<{ success?: boolean; error?: string }>(`/quizzes/${id}`, {
    method: 'DELETE',
  });
  if (!response.success) {
    throw new Error(response.error || 'Failed to delete quiz');
  }
  forgetSavedQuiz(id);
}

export async function launchQuiz(
  id: string,
  settings: {
    accessCode: string;
    endTime: string | null;
    quizAvailabilityMinutes: number | null;
    timePerStudentMinutes: number | null;
    shuffleQuestions: boolean;
    shuffleAnswers: boolean;
    showFinalScore: boolean;
    oneAttempt: boolean;
    launchedAt: string;
  }
) {
  const response = await apiRequest<{ success: boolean; data: HostQuiz; error?: string }>(
    `/quizzes/${id}/launch`,
    { method: 'POST', body: settings }
  );
  if (!response.success) {
    throw new Error(response.error || 'Launch failed');
  }
  return response.data;
}

export async function generateAiQuiz(body: {
  prompt: string;
  questionTypes: string[];
  difficulty: string;
  numberOfQuestions: number;
}) {
  return apiRequest<{ success: boolean; data?: any; error?: string }>('/quiz/generate-ai', {
    method: 'POST',
    body,
  });
}

function isLaunchedFlag(quiz: HostQuiz) {
  const value = quiz.launched as unknown;
  return value === true || value === 1 || value === 'true' || value === '1';
}

/**
 * Web Quiz Library buckets (isQuizCurrentlyActive / isQuizExpired):
 * - Launched: currently active (not past launchSettings.endTime)
 * - Finished: expired launched quiz, or status finished|completed
 * - Ready: otherwise (including after POST /finish writes status ready)
 */
export function quizBucket(quiz: HostQuiz): 'ready' | 'launched' | 'finished' {
  if (isQuizCurrentlyActive(quiz)) return 'launched';
  if (isQuizExpired(quiz)) return 'finished';
  const status = String(quiz.status || '').toLowerCase();
  if (status === 'finished' || status === 'completed') return 'finished';
  if (isLaunchedFlag(quiz) && (status === 'launched' || status === 'active')) return 'launched';
  if (isLaunchedFlag(quiz) && status !== 'finished' && status !== 'completed') return 'launched';
  if (status === 'launched' || status === 'active') return 'launched';
  return 'ready';
}
