import { apiRequest } from '@/lib/api';
import { readLocalQuizSubmissions } from '@/lib/audienceQuizSession';

export type ActivityItem = {
  id: string;
  type?: string;
  title?: string;
  status?: string;
  score?: number | string;
  maxScore?: number;
  submittedAt?: string;
  joinedAt?: string;
  timestamp?: string;
  quizId?: string;
  raceId?: string;
  ticketId?: string;
  chatId?: string;
  rank?: string;
  subtitle?: string;
  date?: string;
  time?: string;
  percentage?: number;
  [key: string]: unknown;
};

export type QuizHistoryRow = {
  id: string;
  title?: string;
  name?: string;
  score?: number;
  maxScore?: number;
  percentage?: number;
  passed?: boolean;
  submittedAt?: string;
  quizId?: string;
  participantId?: string;
  [key: string]: unknown;
};

export type StudentQueryIdentity = {
  uid?: string;
  email?: string;
  name?: string;
  username?: string;
  aliases?: string;
};

function toQuery(params: Record<string, string | number | undefined>) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Same query shape Web getStudentQueryParams sends to /students/activity. */
export function studentQueryFromProfile(profile: {
  uid?: string;
  email?: string;
  name?: string;
  guest?: boolean;
} | null, user?: { uid?: string | null; email?: string | null } | null): StudentQueryIdentity {
  const uid = String(user?.uid || profile?.uid || '').trim();
  const email = String(user?.email || profile?.email || '').trim();
  const name = String(profile?.name || '').trim();
  const identifiers = [...new Set([name, email].filter(Boolean).map((s) => s.toLowerCase().trim()))];
  return {
    uid: uid || undefined,
    email: email || undefined,
    name: name || undefined,
    username: email || undefined,
    aliases: identifiers.length ? identifiers.join(',') : undefined,
  };
}

/** Same identity rule as Web matchesStudentRecord (uid, else email, else name). */
export function matchesStudentRecord(
  record: Record<string, unknown> | null | undefined,
  identity: StudentQueryIdentity
) {
  if (!record) return false;
  const studentUid = String(identity.uid || '').trim();
  const studentEmail = String(identity.email || '').toLowerCase().trim();
  if (studentUid) {
    return Boolean(record.studentUid) && String(record.studentUid).trim() === studentUid;
  }
  if (studentEmail) {
    return (
      Boolean(record.studentEmail) &&
      String(record.studentEmail).toLowerCase().trim() === studentEmail
    );
  }
  const name = String(identity.name || '').toLowerCase().trim();
  if (!name) return false;
  const recordName = String(record.studentName || record.name || '').toLowerCase().trim();
  return Boolean(recordName) && (recordName === name || recordName.includes(name) || name.includes(recordName));
}

function formatWhen(iso?: string | null) {
  if (!iso) return { date: '—', time: '—' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

export async function getStudentActivity(params: StudentQueryIdentity & {
  limit?: number;
  details?: number;
}) {
  const qs = toQuery({
    uid: params.uid,
    email: params.email,
    name: params.name,
    username: params.username,
    aliases: params.aliases,
    limit: params.limit ?? 200,
    details: params.details,
  });
  const response = await apiRequest<{ success?: boolean; data?: ActivityItem[]; error?: string }>(
    `/students/activity${qs}`,
    { auth: false }
  );
  if (response.success === false) {
    throw new Error(response.error || 'Failed to load activity');
  }
  return response.data || [];
}

export async function getStudentQuizHistory(params: StudentQueryIdentity & { limit?: number }) {
  const qs = toQuery({
    uid: params.uid,
    email: params.email,
    name: params.name,
    username: params.username,
    aliases: params.aliases,
    limit: params.limit ?? 200,
  });
  const response = await apiRequest<{ success?: boolean; data?: QuizHistoryRow[]; error?: string }>(
    `/students/quiz-history${qs}`,
    { auth: false }
  );
  if (response.success === false) {
    throw new Error(response.error || 'Failed to load quiz history');
  }
  return response.data || [];
}

/** Web Progress also merges localStorage quizSubmissions; Mobile stores the same list in AsyncStorage. */
export async function localQuizActivityItems(identity: StudentQueryIdentity): Promise<ActivityItem[]> {
  const list = await readLocalQuizSubmissions();
  return list
    .filter((row) => matchesStudentRecord(row, identity))
    .map((row, idx) => {
      const percentage = Number(row.percentage ?? 0);
      const submittedAt = String(row.submittedAt || '');
      const when = formatWhen(submittedAt);
      const quizId = String(row.quizId || '');
      const participantId = String(row.participantId || idx);
      return {
        id: `quiz-${quizId}-${participantId}`,
        type: 'quiz',
        quizId,
        participantId,
        title: String(row.quizTitle || row.title || 'Quiz'),
        subtitle: `${percentage}% score`,
        score: `${percentage}%`,
        percentage,
        submittedAt,
        date: when.date,
        time: when.time,
        source: 'local',
        questions: row.questions,
        answers: row.answers,
        timeTaken: row.timeTaken,
        correctAnswers: row.correctAnswers ?? row.score,
        totalQuestions: row.totalQuestions,
        quizType: row.quizType,
      } as ActivityItem;
    });
}

export async function localQuizHistoryRows(identity: StudentQueryIdentity): Promise<QuizHistoryRow[]> {
  const list = await readLocalQuizSubmissions();
  return list
    .filter((row) => matchesStudentRecord(row, identity))
    .map((row, idx) => {
      const percentage = Number(row.percentage ?? 0);
      const submittedAt = String(row.submittedAt || '');
      const quizId = String(row.quizId || '');
      const participantId = String(row.participantId || idx);
      return {
        id: `${quizId}-${participantId}-${submittedAt}`,
        quizId,
        title: String(row.quizTitle || row.title || 'Quiz'),
        name: String(row.quizTitle || row.title || 'Quiz'),
        percentage,
        score: Number(row.correctAnswers ?? row.score ?? 0),
        passed: percentage >= 60,
        submittedAt,
        source: 'local',
      };
    });
}

function questionList(questions: unknown) {
  if (Array.isArray(questions)) return questions.filter(Boolean);
  if (questions && typeof questions === 'object') {
    return Object.values(questions as Record<string, unknown>).filter(Boolean);
  }
  return [];
}

function hasAnswers(answers: unknown) {
  if (!answers) return false;
  if (Array.isArray(answers)) return answers.length > 0;
  if (typeof answers === 'object') return Object.keys(answers as object).length > 0;
  return false;
}

export function mergeActivityItems(server: ActivityItem[], local: ActivityItem[]) {
  const map = new Map<string, ActivityItem>();
  [...local, ...server].forEach((item) => {
    const key = activityDedupeKey(item);
    const existing = map.get(key);
    const merged = existing ? { ...existing, ...item, id: key } : { ...item, id: key };
    if (!questionList(merged.questions).length && existing) {
      merged.questions = existing.questions;
    }
    if (!hasAnswers(merged.answers) && existing?.answers) {
      merged.answers = existing.answers;
    }
    if (merged.timeTaken == null && existing?.timeTaken != null) {
      merged.timeTaken = existing.timeTaken;
    }
    map.set(key, merged);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(b.sortKey || b.submittedAt || b.joinedAt || '').localeCompare(
      String(a.sortKey || a.submittedAt || a.joinedAt || '')
    )
  );
}

export function mergeQuizHistoryRows(server: QuizHistoryRow[], local: QuizHistoryRow[]) {
  const map = new Map<string, QuizHistoryRow>();
  [...local, ...server].forEach((row) => {
    const key =
      row.quizId && row.participantId
        ? `quiz-${row.quizId}-p-${row.participantId}`
        : String(row.id);
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...row } : row);
  });
  return Array.from(map.values()).sort((a, b) =>
    String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
  );
}

export function activityDedupeKey(item: ActivityItem) {
  if (item.type === 'quiz' && item.quizId && item.participantId) {
    return `quiz-${item.quizId}-${item.participantId}`;
  }
  if (item.id) return String(item.id);
  if (item.type === 'quiz' && item.quizId) return `quiz:${item.quizId}:${item.submittedAt || ''}`;
  if (item.type === 'spaceRace' && item.raceId)
    return `spaceRace:${item.raceId}:${item.joinedAt || ''}`;
  if (item.type === 'exitTicket' && item.ticketId)
    return `exitTicket:${item.ticketId}:${item.submittedAt || ''}`;
  if ((item.type === 'liveChat' || item.type === 'anonymousChat') && (item.chatId || item.id)) {
    return String(item.id || `liveChat-${item.chatId}`);
  }
  return `${item.type || 'item'}:${item.title || ''}:${item.timestamp || ''}`;
}

export function activityLine(item: ActivityItem) {
  if (item.type === 'quiz') {
    const raw = item.percentage ?? item.score;
    if (raw == null || raw === '') return '';
    const n = String(raw).replace(/%/g, '').trim();
    if (!n || n === 'undefined' || n === 'null') return '';
    return `Score: ${n}%`;
  }
  if (item.type === 'spaceRace' && item.rank) {
    const rank = String(item.rank).trim();
    if (!rank || rank === 'undefined' || rank === 'Team —') return '';
    return `Rank: ${rank}`;
  }
  if (item.type === 'exitTicket') {
    return 'Submitted exit ticket';
  }
  const subtitle = String(item.subtitle || '').trim();
  if (!subtitle || subtitle === 'undefined' || subtitle === 'null') return '';
  return subtitle;
}

export function activityWhen(item: ActivityItem) {
  if (item.date && item.time) return `${item.date} · ${item.time}`;
  const iso = String(item.submittedAt || item.joinedAt || item.timestamp || '');
  const when = formatWhen(iso || null);
  return `${when.date} · ${when.time}`;
}

export function activityBadge(item: ActivityItem) {
  if (item.type === 'quiz') return 'Quiz';
  if (item.type === 'exitTicket') return 'Exit Ticket';
  if (item.type === 'spaceRace') return 'Space Race';
  return String(item.type || 'Activity');
}

function visibleText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null' || text === '—') return '';
  return text;
}

/** Home Recent Activity title — exit tickets use resolveExitTicketActivityTitle on the screen. */
export function activityHomeTitle(
  item: ActivityItem,
  ticketTitles: Record<string, string> = {}
) {
  if (item.type === 'exitTicket') {
    const own =
      visibleText(item.title) || visibleText((item as { ticketTitle?: unknown }).ticketTitle);
    if (own && own !== 'Exit Ticket') return own;
    const ticketId = String(item.ticketId || '').trim();
    const fetched = ticketId ? visibleText(ticketTitles[ticketId]) : '';
    return fetched || 'Exit Ticket';
  }
  if (item.type === 'liveChat' || item.type === 'anonymousChat') {
    return visibleText(item.title) || 'Live Chat';
  }
  return visibleText(item.title);
}

/** Home subtitle: "60% score" / "Submitted exit ticket" / "Team 1". Omit empty or Team —. */
export function activityHomeSubtitle(item: ActivityItem) {
  const subtitle = visibleText(item.subtitle);
  if (subtitle && subtitle !== 'Team —') return subtitle;
  if (item.type === 'quiz') {
    const pct = item.percentage ?? item.score;
    if (pct == null || pct === '') return '';
    const n = String(pct).replace(/%/g, '').trim();
    if (!n || n === 'undefined') return '';
    return `${n}% score`;
  }
  if (item.type === 'exitTicket') return 'Submitted exit ticket';
  if (item.type === 'liveChat' || item.type === 'anonymousChat') return 'Joined live chat';
  if (item.type === 'spaceRace') {
    const team = item.teamId ?? (typeof item.rank === 'string' && item.rank.startsWith('Team ')
      ? String(item.rank).replace(/^Team\s+/i, '')
      : '');
    const teamText = visibleText(team);
    if (!teamText) return '';
    return `Team ${teamText}`;
  }
  return '';
}
