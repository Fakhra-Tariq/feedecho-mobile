import {
  equalTo,
  onValue,
  orderByChild,
  query,
  ref,
  update,
} from 'firebase/database';

import { db } from '../../firebaseConfig';
import { apiRequest } from '@/lib/api';
import { notifyHostDataMutated } from '@/lib/hostDataSync';
import { normalizeQuizTypeLabel, type QuizTypeLabel } from '@/lib/aiGeneratedQuiz';
import { isQuizCurrentlyActive, isQuizExpired, isQuizLiveLikeLaunchGuard } from '@/lib/quizExpiry';

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
const savedQuizListeners = new Set<(rows: HostQuiz[]) => void>();

function emitSavedQuizCache() {
  const rows = Array.from(savedQuizCache.values());
  savedQuizListeners.forEach((fn) => fn(rows));
}

export function subscribeSavedQuizCache(onChange: (rows: HostQuiz[]) => void) {
  savedQuizListeners.add(onChange);
  return () => {
    savedQuizListeners.delete(onChange);
  };
}

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
  emitSavedQuizCache();
}

export function forgetSavedQuiz(id: string) {
  savedQuizCache.delete(id);
  emitSavedQuizCache();
}

function quizStampMs(quiz: HostQuiz) {
  const updated = Date.parse(String(quiz.updatedAt || '')) || 0;
  const created = Date.parse(String(quiz.createdAt || '')) || 0;
  return Math.max(updated, created);
}

/**
 * Prefer launched over a stale Ready copy of the same id (Library used to
 * merge `prev` last, which hid AI/editor launches). Finished/newer stamps
 * still beat launched so End is not undone by a lagging snapshot.
 */
export function pickCanonicalQuiz(a: HostQuiz, b: HostQuiz): HostQuiz {
  const id = String(b.id || a.id);
  let aBucket: ReturnType<typeof quizBucket> = 'ready';
  let bBucket: ReturnType<typeof quizBucket> = 'ready';
  try {
    aBucket = quizBucket(a);
  } catch {
    aBucket = 'ready';
  }
  try {
    bBucket = quizBucket(b);
  } catch {
    bBucket = 'ready';
  }
  const aTs = quizStampMs(a);
  const bTs = quizStampMs(b);

  if (aBucket === 'finished' && bBucket === 'launched' && aTs >= bTs) {
    return { ...b, ...a, id };
  }
  if (bBucket === 'finished' && aBucket === 'launched' && bTs >= aTs) {
    return { ...a, ...b, id };
  }
  // Never let a Ready list/API row hide a live launch. GET /quizzes can lag
  // (default limit 50, index delay) while POST /launch still has launched:true.
  if (aBucket === 'launched' && bBucket === 'ready') {
    return { ...b, ...a, id };
  }
  if (bBucket === 'launched' && aBucket === 'ready') {
    return { ...a, ...b, id };
  }
  if (aBucket === 'finished' && bBucket === 'ready') {
    return { ...b, ...a, id };
  }
  if (bBucket === 'finished' && aBucket === 'ready') {
    return { ...a, ...b, id };
  }
  return bTs >= aTs ? { ...a, ...b, id } : { ...b, ...a, id };
}

export function mergeTeacherQuizLists(...lists: HostQuiz[][]) {
  const map = new Map<string, HostQuiz>();
  lists.flat().forEach((quiz) => {
    if (!quiz) return;
    const id = String(quiz.id || '');
    if (!id) return;
    const next = asHostQuiz(quiz, id);
    const prev = map.get(id);
    map.set(id, prev ? pickCanonicalQuiz(prev, next) : next);
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
  onError?: (error: Error) => void,
  ownerIds?: Iterable<string>
) {
  const uid = String(teacherId || '').trim();
  const owners = new Set(
    [uid, ...(ownerIds ? Array.from(ownerIds) : [])]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  // Same query Web HostRealtimeSync / HostReports use. A full-tree listen on
  // /quizzes is permission_denied by deployed rules.
  const quizzesQuery = uid
    ? query(ref(db, 'quizzes'), orderByChild('createdBy'), equalTo(uid))
    : ref(db, 'quizzes');
  return onValue(
    quizzesQuery,
    (snap) => {
      const rows: HostQuiz[] = [];
      if (snap.exists()) {
        Object.entries({ ...(snap.val() || {}) }).forEach(([id, value]) => {
          if (!value || typeof value !== 'object') return;
          const quiz = value as HostQuiz;
          if (owners.size && !owners.has(String(quiz.createdBy || '').trim())) return;
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
  // limit=0 disables the server default slice of 50 so a live quiz cannot
  // fall off the list while the launch guard still scans every quiz.
  const response = await apiRequest<{ success?: boolean; data?: HostQuiz[] }>('/quizzes?limit=0');
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
  notifyHostDataMutated();
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
  notifyHostDataMutated();
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
  const cached = savedQuizCache.get(String(id));
  if (cached) {
    rememberSavedQuiz({
      ...cached,
      launched: false,
      status: 'ready',
      updatedAt: new Date().toISOString(),
    });
  }
  notifyHostDataMutated();
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
  notifyHostDataMutated();
}

/** Same as Web Reports: DELETE /quizzes/:id/launches/:launchId (one launch + its attempts). */
export async function deleteQuizLaunch(quizId: string, launchId: string) {
  const response = await apiRequest<{ success?: boolean; error?: string }>(
    `/quizzes/${quizId}/launches/${encodeURIComponent(launchId)}`,
    { method: 'DELETE' }
  );
  if (!response.success) {
    throw new Error(response.error || 'Failed to delete launch');
  }
  notifyHostDataMutated();
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
  const data = response.data;
  const nextId = String(data?.id || id);
  const cached = savedQuizCache.get(nextId);
  const next = asHostQuiz(
    {
      ...(cached || {}),
      ...(data || {}),
      id: nextId,
      launched: true,
      status: data?.status || 'launched',
      updatedAt: data?.updatedAt || new Date().toISOString(),
    },
    nextId
  );
  rememberSavedQuiz(next);
  notifyHostDataMutated();
  return next;
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
  try {
    if (!quiz || typeof quiz !== 'object') return 'ready';
    if (isQuizLiveLikeLaunchGuard(quiz)) return 'launched';
    if (isQuizCurrentlyActive(quiz)) return 'launched';
    if (isQuizExpired(quiz)) return 'finished';
    const status = String(quiz.status || '').toLowerCase();
    if (status === 'finished' || status === 'completed') return 'finished';
    if (isLaunchedFlag(quiz) && (status === 'launched' || status === 'active')) return 'launched';
    if (isLaunchedFlag(quiz) && status !== 'finished' && status !== 'completed') return 'launched';
    if (status === 'launched' || status === 'active') return 'launched';
    return 'ready';
  } catch {
    return 'ready';
  }
}
