import { get, ref as dbRef } from 'firebase/database';

import { apiRequest } from '@/lib/api';
import { notifyHostDataMutated } from '@/lib/hostDataSync';
import { guestDevicePayload } from '@/lib/audienceDeviceId';
import { db } from '../../firebaseConfig';
import {
  isJoinWindowExpired,
  JoinWindowExpiredError,
} from '@/lib/spaceRaceJoinWindow';

export type SpaceRace = {
  id?: string;
  raceId?: string;
  quizId?: string;
  title?: string;
  description?: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  endedAt?: string;
  joinCode?: string;
  accessCode?: string;
  sessionCode?: string;
  participants?: number | Record<string, unknown>;
  participantsCount?: number;
  teams?: number;
  teamsCount?: number;
  timerSeconds?: number;
  timerMinutes?: number;
  endTime?: string;
  quiz?: any;
  settings?: {
    numberOfTeams?: number;
    teamAssignment?: 'auto-assign' | 'student-choice' | string;
    icon?: string;
    countdown?: number;
    joinDuration?: number;
    timerSeconds?: number;
    studentsPerTeam?: number;
    shuffleQuestions?: boolean;
    shuffleAnswers?: boolean;
    showQuestionFeedback?: boolean;
    showFinalScore?: boolean;
    oneAttempt?: boolean;
  };
};

export type RaceCreatePayload = {
  quizId: string;
  title: string;
  numberOfTeams: number;
  teamAssignment: string;
  icon: string;
  countdown: number;
  joinDuration: number;
  studentsPerTeam: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showQuestionFeedback: boolean;
  showFinalScore: boolean;
  settings: Record<string, unknown>;
};

export async function listSpaceRaces() {
  const response = await apiRequest<{ success?: boolean; data?: SpaceRace[]; races?: SpaceRace[] }>(
    '/space-races'
  );
  return response.data || response.races || [];
}

export async function getSpaceRaceById(id: string) {
  const response = await apiRequest<{ success?: boolean; data?: SpaceRace; race?: SpaceRace }>(
    `/space-races/${id}`
  );
  return response.data || response.race || (response as any);
}

/** Same public GET the Web audience quiz uses (no host auth). */
export async function getPublicSpaceRaceById(id: string) {
  const response = await apiRequest<{
    success?: boolean;
    data?: SpaceRace;
    race?: SpaceRace;
    error?: string;
  }>(`/space-races/${id}`, { auth: false });
  if (response.success === false) {
    throw new Error(response.error || 'Space race not found');
  }
  return response.data || response.race || (response as any);
}

export async function createSpaceRace(payload: RaceCreatePayload) {
  const response = await apiRequest<{
    success?: boolean;
    raceId?: string;
    data?: SpaceRace;
    error?: string;
  }>('/space-races', { method: 'POST', body: payload });
  if (!response.raceId && !response.data?.id && !response.data?.raceId) {
    throw new Error(response.error || 'Failed to create space race');
  }
  notifyHostDataMutated();
  return response;
}

export async function startSpaceRaceCreate(payload: RaceCreatePayload) {
  const response = await apiRequest<{
    success?: boolean;
    raceId?: string;
    data?: SpaceRace;
    joinCode?: string;
    error?: string;
  }>('/space-races/start', { method: 'POST', body: payload });
  if (!response.success && !response.raceId && !response.data) {
    throw new Error(response.error || 'Failed to start space race');
  }
  notifyHostDataMutated();
  return response;
}

export async function updateSpaceRaceStatus(id: string, status: string) {
  const response = await apiRequest<{ success?: boolean; data?: SpaceRace; error?: string }>(
    `/space-races/status/${id}`,
    { method: 'PUT', body: { status } }
  );
  if (!response.success && !response.data) {
    throw new Error(response.error || 'Failed to update race status');
  }
  notifyHostDataMutated();
  return response.data;
}

/** Same as Web `spaceRacesAPI.update` — used by Space Race Settings modal. */
export async function updateSpaceRace(
  id: string,
  payload: { settings?: Record<string, unknown>; [key: string]: unknown }
) {
  const response = await apiRequest<{ success?: boolean; data?: SpaceRace; error?: string }>(
    `/space-races/${id}`,
    { method: 'PUT', body: payload }
  );
  if (response.success === false) {
    throw new Error(response.error || 'Failed to update space race');
  }
  notifyHostDataMutated();
  return response.data;
}

export async function endSpaceRace(id: string) {
  try {
    const response = await apiRequest<{ success?: boolean; data?: SpaceRace; error?: string }>(
      `/space-races/${id}/end`,
      { method: 'POST' }
    );
    if (response.success || response.data) {
      notifyHostDataMutated();
      return response.data;
    }
  } catch {
    // fallback below
  }
  return updateSpaceRaceStatus(id, 'completed');
}

export async function deleteSpaceRace(id: string) {
  const response = await apiRequest<{ success?: boolean; error?: string }>(`/space-races/${id}`, {
    method: 'DELETE',
  });
  if (response.success === false) throw new Error(response.error || 'Failed to delete race');
  notifyHostDataMutated();
}

export async function getRaceParticipants(raceId: string) {
  const response = await apiRequest<{
    success?: boolean;
    data?: any[];
    participants?: any[];
    teamScores?: Record<string, number>;
  }>(`/space-races/${raceId}/participants`);
  return {
    participants: response.data || response.participants || [],
    teamScores: response.teamScores || {},
  };
}

export async function getRaceByCode(joinCode: string) {
  return apiRequest<{ success?: boolean; data?: SpaceRace; error?: string }>(
    `/space-races/code/${encodeURIComponent(joinCode)}`,
    { auth: false }
  );
}

export async function joinSessionUnified(input: {
  name: string;
  code: string;
  teamId?: number | null;
  studentUid?: string;
  studentEmail?: string;
}) {
  const device = await guestDevicePayload();
  return apiRequest<{
    success?: boolean;
    needsTeamSelection?: boolean;
    type?: string;
    data?: any;
    raceId?: string;
    quizId?: string;
    chatId?: string;
    ticketId?: string;
    joinCode?: string;
    participantId?: string;
    teamId?: number | null;
    error?: string;
    message?: string;
  }>('/sessions/join', {
    method: 'POST',
    auth: false,
    body: {
      name: input.name,
      code: input.code,
      ...(input.teamId != null ? { teamId: input.teamId } : {}),
      ...(input.studentUid ? { studentUid: input.studentUid } : {}),
      ...(input.studentEmail ? { studentEmail: input.studentEmail } : {}),
      ...device,
    },
  });
}

async function readServerNowMs() {
  try {
    const snap = await get(dbRef(db, '.info/serverTimeOffset'));
    return Date.now() + (Number(snap.val()) || 0);
  } catch {
    return Date.now();
  }
}

async function readLiveRace(raceId: string) {
  const snap = await get(dbRef(db, `spaceRaces/${raceId}`));
  return snap.exists() ? snap.val() : null;
}

async function teamHasStartedQuiz(raceId: string, teamId: number | string | null | undefined) {
  if (teamId == null || teamId === '') return false;
  const snap = await get(dbRef(db, `space_race_team_timers/${raceId}/team_${teamId}`));
  return Boolean(snap.exists() && snap.val()?.quizStartedAt);
}

/** Reject late writes after join end. Start is allowed if the team already started on time. */
async function assertJoinWindowAllowsWrite(
  raceId: string,
  teamId?: number | string | null,
  { allowIfTeamStarted = false } = {}
) {
  try {
    const race = await readLiveRace(raceId);
    if (!race) return;
    const now = await readServerNowMs();
    if (!isJoinWindowExpired(race, now)) return;
    if (allowIfTeamStarted && (await teamHasStartedQuiz(raceId, teamId))) return;
    throw new JoinWindowExpiredError();
  } catch (err) {
    if (err instanceof JoinWindowExpiredError) throw err;
  }
}

export async function setTeamSelection(
  raceId: string,
  data: {
    teamId: number | string;
    questionId: string;
    selectedOption?: unknown;
    participantId: string;
    participantName?: string;
    senderName?: string;
    submitted?: boolean;
    submittedByName?: string;
  }
) {
  await assertJoinWindowAllowsWrite(raceId, data.teamId);
  return apiRequest(`/space-races/${raceId}/team-selection`, {
    method: 'POST',
    auth: false,
    body: {
      ...data,
      teamId: data.teamId != null ? String(data.teamId) : data.teamId,
      senderName: data.senderName || data.participantName,
    },
  });
}

/** Same GET Web uses so a teammate who reconnects reads the current lock, not only future events. */
export async function getTeamSelection(
  raceId: string,
  teamId: number | string,
  questionId: string
) {
  const qs = `?teamId=${encodeURIComponent(String(teamId))}&questionId=${encodeURIComponent(questionId)}`;
  return apiRequest<{ success?: boolean; data?: any }>(
    `/space-races/${raceId}/team-selection${qs}`,
    { auth: false }
  );
}

export async function submitRaceAnswer(
  raceId: string,
  answerData: {
    teamId: number | string;
    questionId: string;
    answer: unknown;
    participantId: string;
    participantName?: string;
    questionIndex?: number;
  }
) {
  await assertJoinWindowAllowsWrite(raceId, answerData.teamId);
  return apiRequest<{ success?: boolean; data?: any; error?: string }>(
    `/space-races/${raceId}/submit-answer`,
    { method: 'POST', auth: false, body: answerData }
  );
}

export async function startTeamQuiz(
  raceId: string,
  data: {
    teamId: number;
    participantId: string;
    quizId?: string;
    timerSeconds?: number;
    studentName?: string;
    studentUid?: string;
  }
) {
  await assertJoinWindowAllowsWrite(raceId, data.teamId, { allowIfTeamStarted: true });
  const device = data.studentUid ? {} : await guestDevicePayload();
  return apiRequest(`/space-races/${raceId}/start-quiz`, {
    method: 'POST',
    auth: false,
    body: { ...data, ...device },
  });
}

export async function getFinalScore(
  raceId: string,
  params: { teamId: number | string; participantId: string }
) {
  const qs = `?teamId=${params.teamId}&participantId=${encodeURIComponent(params.participantId)}`;
  return apiRequest(`/space-races/${raceId}/final-score${qs}`, { auth: false });
}

export async function getStandings(raceId: string) {
  return apiRequest<{ success?: boolean; data?: any[] }>(`/space-races/${raceId}/standings`, {
    auth: false,
  });
}

/** Same as Web spaceRacesAPI.getStudentHistory → space_race_student_history / participants. */
export async function getStudentSpaceRaceHistory(params: {
  uid?: string;
  email?: string;
  name?: string;
  username?: string;
  aliases?: string;
}) {
  const qs = [
    params.uid ? `uid=${encodeURIComponent(params.uid)}` : '',
    params.email ? `email=${encodeURIComponent(params.email)}` : '',
    params.name ? `name=${encodeURIComponent(params.name)}` : '',
    params.username ? `username=${encodeURIComponent(params.username)}` : '',
    params.aliases ? `aliases=${encodeURIComponent(params.aliases)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const response = await apiRequest<{
    success?: boolean;
    data?: Array<{
      raceId: string;
      quizName?: string;
      joinedAt?: string;
      sessionDate?: string;
      teamId?: number;
    }>;
  }>(`/space-races/student/history${qs ? `?${qs}` : ''}`, { auth: false });
  return response.data || [];
}

/** Same as Web spaceRacesAPI.getSharedResources. */
export async function getSharedRaceResources(
  raceId: string,
  teamId: number,
  params: { uid?: string; email?: string; name?: string; username?: string; aliases?: string }
) {
  const qs = [
    `teamId=${encodeURIComponent(String(teamId))}`,
    params.uid ? `uid=${encodeURIComponent(params.uid)}` : '',
    params.email ? `email=${encodeURIComponent(params.email)}` : '',
    params.name ? `name=${encodeURIComponent(params.name)}` : '',
    params.username ? `username=${encodeURIComponent(params.username)}` : '',
    params.aliases ? `aliases=${encodeURIComponent(params.aliases)}` : '',
  ]
    .filter(Boolean)
    .join('&');
  const response = await apiRequest<{
    success?: boolean;
    data?: Array<{
      id?: string;
      resourceId?: string;
      type?: string;
      fileName?: string;
      name?: string;
      linkTitle?: string;
      url?: string;
      downloadUrl?: string;
      senderName?: string;
      sharedBy?: string;
      sharedAt?: string;
      createdAt?: string;
    }>;
  }>(`/space-races/${encodeURIComponent(raceId)}/shared-resources?${qs}`, { auth: false });
  return response.data || [];
}

export async function getTeamChatMessages(raceId: string, teamId: string | number) {
  return apiRequest<{ success?: boolean; data?: any[] }>(
    `/space-races/${raceId}/team-chat?teamId=${encodeURIComponent(String(teamId))}`,
    { auth: false }
  );
}

export async function sendTeamChatMessage(
  raceId: string,
  messageData: {
    teamId: number | string;
    participantId: string;
    senderName?: string;
    text?: string;
    type?: string;
    url?: string;
    fileName?: string;
    linkTitle?: string;
  },
  onUploadProgress?: (ratio: number) => void
) {
  // Same POST body as Web: POST /space-races/:raceId/team-chat (auth: false).
  const body = {
    ...messageData,
    text: String(messageData.text ?? ''),
  };
  // Data-URL attachments are large JSON. RN XMLHttpRequest often fails those
  // POSTs; fetch matches the Web axios path more reliably. Progress is still
  // reported around the request so the bubble does not stick on a spinner.
  const isDataUrl = String(body.url || '').startsWith('data:');
  if (isDataUrl) onUploadProgress?.(0.15);
  const response = await apiRequest<{ success?: boolean; data?: any; error?: string }>(
    `/space-races/${raceId}/team-chat`,
    {
      method: 'POST',
      auth: false,
      body,
      onUploadProgress:
        isDataUrl || !onUploadProgress
          ? undefined
          : (loaded, total) => {
              if (!total) return;
              onUploadProgress(loaded / total);
            },
    }
  );
  if (isDataUrl) onUploadProgress?.(1);
  return response;
}

export function buildRacePayload(input: {
  quizId: string;
  title: string;
  numberOfTeams: number;
  teamAssignment: string;
  icon: string;
  countdown: number;
  joinDuration: number;
  studentsPerTeam: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showQuestionFeedback: boolean;
  showFinalScore: boolean;
}): RaceCreatePayload {
  const settings = {
    numberOfTeams: Number(input.numberOfTeams),
    teamAssignment: input.teamAssignment,
    icon: input.icon,
    countdown: Number(input.countdown),
    timerSeconds: Number(input.countdown),
    joinDuration: Number(input.joinDuration),
    studentsPerTeam: Number(input.studentsPerTeam),
    shuffleQuestions: Boolean(input.shuffleQuestions),
    shuffleAnswers: Boolean(input.shuffleAnswers),
    showQuestionFeedback: Boolean(input.showQuestionFeedback),
    showFinalScore: Boolean(input.showFinalScore),
  };
  return {
    quizId: input.quizId,
    title: input.title,
    numberOfTeams: settings.numberOfTeams,
    teamAssignment: settings.teamAssignment,
    icon: settings.icon,
    countdown: settings.countdown,
    joinDuration: settings.joinDuration,
    studentsPerTeam: settings.studentsPerTeam,
    shuffleQuestions: settings.shuffleQuestions,
    shuffleAnswers: settings.shuffleAnswers,
    showQuestionFeedback: settings.showQuestionFeedback,
    showFinalScore: settings.showFinalScore,
    settings,
  };
}
