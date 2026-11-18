import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiRequest } from '@/lib/api';
import { hasLocalQuizSubmission, readLocalQuizSubmissions } from '@/lib/audienceQuizSession';
import { normalizeGuestName as normalizeGuestNameShared } from '@/lib/guestAttemptIdentity';
import { getStudentActivity, studentQueryFromProfile } from '@/lib/studentsActivity';

/** Local-only markers. No answers. Same-device backup for GET /students/activity. */
const EXIT_PARTICIPATION_KEY = 'exitTicketParticipations';
const QUIZ_PROGRESS_KEY = 'quizAttemptProgress';

export type ParticipationStatus = 'none' | 'in_progress' | 'submitted';

export type QuizAttemptProgress = {
  quizId: string;
  uid: string;
  status: 'in_progress' | 'submitted';
  currentQuestion: number;
  answers: Record<string, unknown>;
  startedAt: string;
  originalParticipantId?: string | null;
};

export type QuizSubmittedResult = {
  percentage: number;
  correctAnswers: number;
  totalQuestions: number;
};

export type MyParticipation = {
  status: ParticipationStatus;
  progress?: QuizAttemptProgress;
  result?: QuizSubmittedResult;
};

function progressKey(uid: string, quizId: string) {
  return `${uid}:${quizId}`;
}

function exitKey(uid: string, ticketId: string) {
  return `${uid}:${ticketId}`;
}

async function readJsonMap(storageKey: string): Promise<Record<string, any>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeJsonMap(storageKey: string, map: Record<string, any>) {
  await AsyncStorage.setItem(storageKey, JSON.stringify(map));
}

export async function markExitTicketParticipated(uid: string, ticketId: string) {
  if (!uid || !ticketId) return;
  try {
    const map = await readJsonMap(EXIT_PARTICIPATION_KEY);
    map[exitKey(uid, ticketId)] = { submittedAt: new Date().toISOString() };
    await writeJsonMap(EXIT_PARTICIPATION_KEY, map);
  } catch {
    // never block submit
  }
}

export async function hasLocalExitTicketParticipation(uid: string, ticketId: string) {
  if (!uid || !ticketId) return false;
  const map = await readJsonMap(EXIT_PARTICIPATION_KEY);
  return Boolean(map[exitKey(uid, ticketId)]);
}

export async function readQuizAttemptProgress(
  uid: string,
  quizId: string
): Promise<QuizAttemptProgress | null> {
  if (!uid || !quizId) return null;
  const map = await readJsonMap(QUIZ_PROGRESS_KEY);
  const row = map[progressKey(uid, quizId)];
  if (!row || typeof row !== 'object') return null;
  return row as QuizAttemptProgress;
}

export async function saveQuizAttemptProgress(progress: QuizAttemptProgress) {
  if (!progress?.uid || !progress?.quizId) return;
  try {
    const map = await readJsonMap(QUIZ_PROGRESS_KEY);
    map[progressKey(progress.uid, progress.quizId)] = progress;
    await writeJsonMap(QUIZ_PROGRESS_KEY, map);
  } catch {
    // never block answering
  }
}

export async function markQuizAttemptSubmitted(uid: string, quizId: string) {
  const existing = await readQuizAttemptProgress(uid, quizId);
  await saveQuizAttemptProgress({
    quizId,
    uid,
    status: 'submitted',
    currentQuestion: existing?.currentQuestion ?? 0,
    answers: existing?.answers || {},
    startedAt: existing?.startedAt || new Date().toISOString(),
    originalParticipantId: existing?.originalParticipantId || null,
  });
}

function resultFromActivityRow(row: Record<string, unknown> | null | undefined): QuizSubmittedResult | undefined {
  if (!row) return undefined;
  const totalQuestions = Number(row.totalQuestions ?? 0);
  const correctAnswers = Number(row.correctAnswers ?? 0);
  const percentage = Number(row.percentage ?? 0);
  if (!totalQuestions && !percentage && !correctAnswers) return undefined;
  return {
    percentage,
    correctAnswers,
    totalQuestions,
  };
}

/**
 * Logged-in student only. Exit Ticket + Quiz.
 * Submitted: GET /students/activity (exit_responses / quiz_submissions by studentUid).
 * In-progress quiz: AsyncStorage (no RTDB progress node exists).
 */
export async function getMyParticipation(
  activityType: 'exitTicket' | 'quiz',
  activityId: string,
  uid: string,
  extras?: { email?: string | null; name?: string | null }
): Promise<MyParticipation> {
  const studentUid = String(uid || '').trim();
  const id = String(activityId || '').trim();
  if (!studentUid || !id) return { status: 'none' };

  const identity = studentQueryFromProfile(
    { uid: studentUid, email: extras?.email || '', name: extras?.name || '', guest: false },
    { uid: studentUid, email: extras?.email || null }
  );

  if (activityType === 'exitTicket') {
    if (await hasLocalExitTicketParticipation(studentUid, id)) {
      return { status: 'submitted' };
    }
    try {
      const items = await getStudentActivity({ ...identity, limit: 200 });
      const hit = items.some(
        (item) =>
          String(item.type || '') === 'exitTicket' && String(item.ticketId || '') === id
      );
      if (hit) return { status: 'submitted' };
    } catch {
      // local marker already checked
    }
    return { status: 'none' };
  }

  try {
    const items = await getStudentActivity({ ...identity, details: 1, limit: 200 });
    const row = items.find(
      (item) => String(item.type || '') === 'quiz' && String(item.quizId || '') === id
    );
    if (row) {
      return { status: 'submitted', result: resultFromActivityRow(row) };
    }
  } catch {
    // fall through to local
  }

  if (
    await hasLocalQuizSubmission(id, {
      studentUid,
      studentEmail: extras?.email || null,
    })
  ) {
    const local = (await readLocalQuizSubmissions()).find(
      (row) =>
        String(row.quizId) === id &&
        (String(row.studentUid || '') === studentUid ||
          (extras?.email &&
            String(row.studentEmail || '').toLowerCase() === String(extras.email).toLowerCase()))
    );
    return {
      status: 'submitted',
      result: resultFromActivityRow(local as Record<string, unknown>),
    };
  }

  const progress = await readQuizAttemptProgress(studentUid, id);
  if (progress?.status === 'submitted') {
    return { status: 'submitted' };
  }
  if (progress?.status === 'in_progress') {
    return { status: 'in_progress', progress };
  }

  return { status: 'none' };
}

export const GUEST_QUIZ_ALREADY_ATTEMPTED = 'You have already attempted this quiz.';
export const GUEST_EXIT_TICKET_ALREADY_SUBMITTED =
  'You have already submitted this exit ticket.';

/** Same algorithm as the website / server guest name normalizer. */
export function normalizeGuestName(name: string) {
  return normalizeGuestNameShared(name);
}

export async function rememberExitTicketAttempt(ticketId: string, attemptId?: string | null) {
  const id = String(ticketId || '').trim();
  const attempt = String(attemptId || '').trim();
  if (!id || !attempt) return;
  try {
    const map = await readJsonMap(EXIT_PARTICIPATION_KEY);
    const existing = map[id];
    map[id] = {
      ...(existing && typeof existing === 'object' ? existing : {}),
      attemptId: attempt,
    };
    await writeJsonMap(EXIT_PARTICIPATION_KEY, map);
  } catch {
    // ignore
  }
}

export async function markGuestExitTicketSubmitted(ticketId: string, name: string) {
  const normalized = normalizeGuestName(name);
  if (!ticketId || !normalized) return;
  try {
    const map = await readJsonMap(EXIT_PARTICIPATION_KEY);
    map[exitKey(`guest:${normalized}`, ticketId)] = { submittedAt: new Date().toISOString() };
    await writeJsonMap(EXIT_PARTICIPATION_KEY, map);
  } catch {
    // never block submit
  }
}

async function guestNameSubmittedLocally(
  activityType: 'exitTicket' | 'quiz',
  activityId: string,
  normalizedName: string
) {
  if (activityType === 'exitTicket') {
    const map = await readJsonMap(EXIT_PARTICIPATION_KEY);
    return Boolean(map[exitKey(`guest:${normalizedName}`, activityId)]);
  }
  const list = await readLocalQuizSubmissions();
  return list.some(
    (row) =>
      String(row.quizId) === String(activityId) &&
      !row.studentUid &&
      normalizeGuestName(String(row.studentName || '')) === normalizedName
  );
}

/**
 * Same-device local marker only. Cross-device / same-name blocking is the
 * server (deviceId + normalizedName). Do not query GET /students/activity by name.
 */
export async function hasGuestSubmitted(
  activityType: 'exitTicket' | 'quiz',
  activityId: string,
  name: string
): Promise<boolean> {
  const id = String(activityId || '').trim();
  const normalized = normalizeGuestName(name);
  if (!id || !normalized) return false;
  return guestNameSubmittedLocally(activityType, id, normalized);
}

/** Server 409 is the source of truth; keep this for call-site compatibility. */
export async function guestJoinBlockReason(_name: string, _code: string): Promise<string | null> {
  return null;
}
