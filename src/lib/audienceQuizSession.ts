import AsyncStorage from '@react-native-async-storage/async-storage';

/** Same key Web uses in localStorage for the locked join session. */
export const STUDENT_SESSION_KEY = 'studentSession';
const QUIZ_PARTICIPANT_SESSIONS_KEY = 'quizParticipantSessions';
const QUIZ_SUBMISSIONS_KEY = 'quizSubmissions';

export type AudienceQuizSession = {
  studentName: string;
  sessionCode: string;
  quizId: string;
  participantId: string;
  quizTitle?: string;
  quizType?: string;
  quiz?: any;
  joinedAt: string;
  isLocked?: boolean;
  lockTimestamp?: string;
  studentUid?: string | null;
  studentEmail?: string | null;
};

export type QuizParticipantSession = {
  participantId: string;
  sessionCode?: string;
  studentName?: string;
  joinedAt?: string;
  studentUid?: string | null;
  studentEmail?: string | null;
};

export async function saveStudentQuizSession(session: AudienceQuizSession) {
  await AsyncStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
}

export async function readStudentQuizSession(): Promise<AudienceQuizSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STUDENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearStudentQuizSession() {
  await AsyncStorage.removeItem(STUDENT_SESSION_KEY);
}

/** Same as Web persistQuizParticipantSession. */
export async function persistQuizParticipantSession(
  quizId: string,
  payload: QuizParticipantSession
) {
  if (!quizId || !payload?.participantId) return;
  try {
    const raw = await AsyncStorage.getItem(QUIZ_PARTICIPANT_SESSIONS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const next = map && typeof map === 'object' ? map : {};
    next[String(quizId)] = {
      participantId: payload.participantId,
      sessionCode: payload.sessionCode || '',
      studentName: payload.studentName || '',
      joinedAt: payload.joinedAt || new Date().toISOString(),
      studentUid: payload.studentUid || null,
      studentEmail: payload.studentEmail || null,
    };
    await AsyncStorage.setItem(QUIZ_PARTICIPANT_SESSIONS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function readQuizParticipantSession(
  quizId: string
): Promise<QuizParticipantSession | null> {
  if (!quizId) return null;
  try {
    const raw = await AsyncStorage.getItem(QUIZ_PARTICIPANT_SESSIONS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const stored = map?.[String(quizId)] || null;
    return stored?.participantId ? stored : null;
  } catch {
    return null;
  }
}

export async function readLocalQuizSubmissions(): Promise<Record<string, unknown>[]> {
  try {
    const raw = await AsyncStorage.getItem(QUIZ_SUBMISSIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveLocalQuizSubmission(incoming: Record<string, unknown>) {
  if (!incoming || typeof incoming !== 'object') return;
  try {
    const raw = await AsyncStorage.getItem(QUIZ_SUBMISSIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    arr.push(incoming);
    await AsyncStorage.setItem(QUIZ_SUBMISSIONS_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export async function hasLocalQuizSubmission(
  quizId: string,
  identity: {
    participantId?: string | null;
    studentUid?: string | null;
    studentEmail?: string | null;
    studentName?: string | null;
  } = {}
) {
  try {
    const raw = await AsyncStorage.getItem(QUIZ_SUBMISSIONS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return false;
    return list.some((row: any) => {
      if (!row || String(row.quizId) !== String(quizId)) return false;
      if (identity.participantId && row.participantId === identity.participantId) return true;
      if (identity.studentUid && row.studentUid === identity.studentUid) return true;
      if (
        identity.studentEmail &&
        row.studentEmail &&
        String(row.studentEmail).toLowerCase() === String(identity.studentEmail).toLowerCase()
      ) {
        return true;
      }
      if (
        identity.studentName &&
        row.studentName &&
        String(row.studentName).trim() === String(identity.studentName).trim()
      ) {
        return true;
      }
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Build + persist the locked quiz session Web stores after POST /sessions/join.
 * studentUid / studentEmail only when present (logged-in); guests omit them.
 */
export async function persistJoinedQuizSession(input: {
  studentName: string;
  sessionCode: string;
  quizId: string;
  participantId: string;
  quiz: any;
  studentUid?: string | null;
  studentEmail?: string | null;
}) {
  const joinedAt = new Date().toISOString();
  const session: AudienceQuizSession = {
    studentName: input.studentName,
    sessionCode: input.sessionCode,
    quizId: input.quizId,
    participantId: input.participantId,
    quizTitle: input.quiz?.title || 'Untitled Quiz',
    quizType: input.quiz?.type || 'Multiple Choice',
    quiz: input.quiz,
    joinedAt,
    isLocked: true,
    lockTimestamp: joinedAt,
    ...(input.studentUid ? { studentUid: input.studentUid } : {}),
    ...(input.studentEmail ? { studentEmail: input.studentEmail } : {}),
  };
  await saveStudentQuizSession(session);
  await persistQuizParticipantSession(input.quizId, {
    participantId: input.participantId,
    sessionCode: input.sessionCode,
    studentName: input.studentName,
    joinedAt,
    studentUid: input.studentUid || null,
    studentEmail: input.studentEmail || null,
  });
  return session;
}
