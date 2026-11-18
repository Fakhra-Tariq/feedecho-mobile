import { ApiError, apiRequest } from '@/lib/api';
import {
  findLocalQuizSubmissionForJoin,
  persistJoinedQuizSession,
} from '@/lib/audienceQuizSession';
import { getExitTicketByCode } from '@/lib/hostExitTickets';
import { joinSessionUnified } from '@/lib/hostSpaceRaces';
import { normalizeTeamId, saveSpaceRaceParticipant } from '@/lib/spaceRaceSession';
import { getMyParticipation } from '@/lib/studentParticipation';

/** Map /sessions/join `type` to Mobile audience activity routes (same as Web). */
export function mapJoinActivityType(
  type: string | undefined
): 'quiz' | 'spaceRace' | 'exitTicket' | 'liveChat' | null {
  if (type === 'quiz') return 'quiz';
  if (type === 'spaceRace') return 'spaceRace';
  if (type === 'exitTicket') return 'exitTicket';
  if (type === 'liveChat' || type === 'anonymousChat') return 'liveChat';
  return null;
}

export type JoinSessionResult = {
  success: boolean;
  error?: string;
  activityType?: 'quiz' | 'spaceRace' | 'exitTicket' | 'liveChat' | string | null;
  code?: string;
  raceId?: string;
  quizId?: string;
  ticketId?: string;
  participantId?: string;
  needsTeamSelection?: boolean;
  raceData?: any;
  alreadySubmitted?: boolean;
  alreadyAttemptedOnDevice?: boolean;
};

function joinErrorMessage(error: unknown, fallback = 'Failed to join session. Please try again.') {
  if (error instanceof ApiError) {
    const data = error.data as { message?: string; error?: string } | null;
    return data?.message || data?.error || error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function joinErrorMessageForDisplay(error: unknown, studentUid?: string) {
  return sanitizeJoinFailMessage(joinErrorMessage(error), studentUid);
}

function sanitizeJoinFailMessage(message: string, studentUid?: string) {
  if (/already been used on this device/i.test(String(message))) {
    return studentUid
      ? 'You have already completed this quiz'
      : 'Failed to join session. Please try again.';
  }
  return message;
}

function isAlreadyCompletedQuizError(error: unknown, message?: string) {
  if (error instanceof ApiError) {
    const data = error.data as { code?: string } | null;
    if (data?.code === 'ALREADY_ATTEMPTED') return true;
  }
  const text = message || joinErrorMessage(error, '');
  return (
    /already completed this quiz/i.test(String(text)) ||
    /already been used on this device/i.test(String(text))
  );
}

async function alreadyAttemptedJoinResult(
  code: string,
  trimmedName: string
): Promise<JoinSessionResult> {
  try {
    const lookup = await apiRequest<{
      success?: boolean;
      type?: string;
      quizId?: string;
      raceId?: string;
      ticketId?: string;
      joinCode?: string;
      data?: any;
    }>(`/sessions/code/${encodeURIComponent(code)}`, { auth: false });
    const activityType = mapJoinActivityType(lookup?.type);
    const quizId = String(lookup?.quizId || lookup?.data?.id || '').trim();
    const raceId = String(lookup?.raceId || (lookup?.type === 'spaceRace' ? lookup?.data?.id : '') || '').trim();
    const ticketId = String(lookup?.ticketId || (lookup?.type === 'exitTicket' ? lookup?.data?.id : '') || '').trim();

    if (activityType === 'quiz' && quizId) {
      if (lookup?.data) {
        try {
          await persistJoinedQuizSession({
            studentName: trimmedName,
            sessionCode: code,
            quizId,
            participantId: String(lookup?.data?.participantId || `completed-${quizId}`),
            quiz: lookup.data,
          });
        } catch {
          // still navigate to the completed screen
        }
      }
      return {
        success: true,
        activityType: 'quiz',
        code,
        quizId,
        alreadySubmitted: true,
        alreadyAttemptedOnDevice: true,
      };
    }
    if (activityType === 'spaceRace' && (raceId || code)) {
      return {
        success: true,
        activityType: 'spaceRace',
        code,
        raceId: raceId || undefined,
        alreadySubmitted: true,
        alreadyAttemptedOnDevice: true,
      };
    }
    if (activityType === 'exitTicket') {
      return {
        success: true,
        activityType: 'exitTicket',
        code: String(lookup?.joinCode || code).toUpperCase(),
        ticketId: ticketId || undefined,
        alreadySubmitted: true,
        alreadyAttemptedOnDevice: true,
      };
    }
  } catch {
    // /sessions/code does not include exit tickets — try the ticket endpoint.
  }

  try {
    const ticketRes = await getExitTicketByCode(code);
    if (ticketRes?.success && ticketRes.data) {
      return {
        success: true,
        activityType: 'exitTicket',
        code,
        ticketId: String(ticketRes.data.id || '').trim() || undefined,
        alreadySubmitted: true,
        alreadyAttemptedOnDevice: true,
      };
    }
  } catch {
    // Not an exit ticket (or inactive).
  }

  return {
    success: false,
    error: 'Failed to join session. Please try again.',
    alreadyAttemptedOnDevice: true,
  };
}

/**
 * Same contract as Web `proceedWithSessionJoin` / `joinSessionByCode`:
 * POST /sessions/join (server uses sessions/{id}.currentActivity).
 * Does not switch host/audience portal — AuthContext does that after a real join.
 */
async function alreadySubmittedQuizJoin(
  code: string,
  studentUid: string,
  studentEmail?: string
): Promise<JoinSessionResult | null> {
  try {
    const lookup = await apiRequest<{
      success?: boolean;
      type?: string;
      quizId?: string;
      data?: { id?: string };
    }>(`/sessions/code/${encodeURIComponent(code)}`, { auth: false });
    const quizId = String(lookup?.quizId || lookup?.data?.id || '').trim();
    if (lookup?.type !== 'quiz' || !quizId) return null;
    const part = await getMyParticipation('quiz', quizId, studentUid, { email: studentEmail });
    if (part.status !== 'submitted') return null;
    return {
      success: true,
      activityType: 'quiz',
      code,
      quizId,
      alreadySubmitted: true,
    };
  } catch {
    return null;
  }
}

export async function executeSessionJoin(input: {
  name: string;
  code: string;
  teamId?: number | null;
  studentUid?: string | null;
  studentEmail?: string | null;
  loggedInStudent?: boolean;
}): Promise<JoinSessionResult> {
  const trimmedName = String(input.name || 'Audience').trim() || 'Audience';
  const trimmedCode = String(input.code || '')
    .trim()
    .toUpperCase();

  if (trimmedCode.length !== 6) {
    return { success: false, error: 'Session code must be exactly 6 characters' };
  }

  const studentUid = input.studentUid || undefined;
  const studentEmail = input.studentEmail || undefined;

  try {
    const localCompleted = await findLocalQuizSubmissionForJoin({
      sessionCode: trimmedCode,
      studentUid,
      studentEmail,
      studentName: trimmedName,
    });
    if (localCompleted) {
      if (studentUid) {
        const submitted = await alreadySubmittedQuizJoin(
          trimmedCode,
          studentUid,
          studentEmail
        );
        if (submitted) return submitted;
      } else {
        const quizId = String(localCompleted.quizId || '').trim();
        try {
          const lookup = await apiRequest<{
            success?: boolean;
            type?: string;
            quizId?: string;
            data?: any;
          }>(`/sessions/code/${encodeURIComponent(trimmedCode)}`, { auth: false });
          const resolvedId = String(lookup?.quizId || lookup?.data?.id || quizId).trim();
          const quiz = lookup?.data;
          if (lookup?.type === 'quiz' && resolvedId && quiz) {
            await persistJoinedQuizSession({
              studentName: trimmedName,
              sessionCode: trimmedCode,
              quizId: resolvedId,
              participantId: String(localCompleted.participantId || `completed-${resolvedId}`),
              quiz,
            });
            return {
              success: true,
              activityType: 'quiz',
              code: trimmedCode,
              quizId: resolvedId,
              alreadySubmitted: true,
              alreadyAttemptedOnDevice: true,
            };
          }
        } catch {
          // still block from the local row
        }
        if (quizId) {
          return {
            success: true,
            activityType: 'quiz',
            code: trimmedCode,
            quizId,
            alreadySubmitted: true,
            alreadyAttemptedOnDevice: true,
          };
        }
      }
    }

    const response = await joinSessionUnified({
      name: trimmedName,
      code: trimmedCode,
      teamId: input.teamId ?? null,
      studentUid,
      studentEmail,
    });

    if (response.needsTeamSelection && response.type === 'spaceRace') {
      return {
        success: false,
        needsTeamSelection: true,
        activityType: 'spaceRace',
        code: trimmedCode,
        raceId: response.raceId ? String(response.raceId) : undefined,
        raceData: response.data,
      };
    }

    if (!response.success) {
      const failMessage =
        response.message ||
        response.error ||
        'Failed to join session. Please try again.';
      if (isAlreadyCompletedQuizError(null, failMessage)) {
        if (studentUid) {
          const submitted = await alreadySubmittedQuizJoin(
            trimmedCode,
            studentUid,
            studentEmail
          );
          if (submitted) return submitted;
        }
        return alreadyAttemptedJoinResult(trimmedCode, trimmedName);
      }
      return {
        success: false,
        error: sanitizeJoinFailMessage(failMessage, studentUid),
      };
    }

    const activityType = mapJoinActivityType(response.type);
    if (!activityType) {
      return { success: false, error: 'Unsupported session type' };
    }

    if (response.type === 'spaceRace' && response.participantId) {
      const assignedTeamId = normalizeTeamId(
        response.teamId ?? input.teamId ?? response.data?.participant?.teamId ?? null
      );
      await saveSpaceRaceParticipant({
        id: response.participantId,
        name: trimmedName,
        raceId: response.raceId || response.data?.id,
        teamId: assignedTeamId,
        studentUid: studentUid || undefined,
        studentEmail: studentEmail || undefined,
        launchId: response.data?.currentLaunchId || null,
        joinedAsGuest: !studentUid,
      });
    }

    const ticketId = response.ticketId
      ? String(response.ticketId)
      : response.data?.id && activityType === 'exitTicket'
        ? String(response.data.id)
        : undefined;

    let alreadySubmitted = false;
    if (
      input.loggedInStudent &&
      studentUid &&
      (activityType === 'quiz' || activityType === 'exitTicket')
    ) {
      const activityId =
        activityType === 'quiz'
          ? String(response.quizId || response.data?.id || response.data?.quizId || '')
          : String(ticketId || '');
      if (activityId) {
        try {
          const part = await getMyParticipation(activityType, activityId, studentUid, {
            email: studentEmail,
            name: trimmedName,
          });
          alreadySubmitted = part.status === 'submitted';
        } catch {
          alreadySubmitted = false;
        }
      }
    }

    if (response.type === 'quiz') {
      const quizId = String(response.quizId || response.data?.id || response.data?.quizId || '');
      if (!response.data || !response.data.title) {
        return { success: false, error: 'Quiz data is incomplete. Please try again.' };
      }
      if (!quizId || !response.participantId) {
        return { success: false, error: 'Quiz data is incomplete. Please try again.' };
      }
      if (!alreadySubmitted) {
        await persistJoinedQuizSession({
          studentName: trimmedName,
          sessionCode: trimmedCode,
          quizId,
          participantId: String(response.participantId),
          quiz: response.data,
          studentUid: studentUid || null,
          studentEmail: studentEmail || null,
        });
      }
      return {
        success: true,
        activityType,
        code: String(response.joinCode || trimmedCode).toUpperCase(),
        quizId,
        participantId: String(response.participantId),
        alreadySubmitted,
      };
    }

    return {
      success: true,
      activityType,
      code: String(response.joinCode || trimmedCode).toUpperCase(),
      raceId: response.raceId ? String(response.raceId) : undefined,
      quizId: response.quizId ? String(response.quizId) : undefined,
      ticketId,
      participantId: response.participantId ? String(response.participantId) : undefined,
      alreadySubmitted,
    };
  } catch (error) {
    const failMessage = joinErrorMessage(error);
    if (isAlreadyCompletedQuizError(error, failMessage)) {
      if (studentUid) {
        const submitted = await alreadySubmittedQuizJoin(
          trimmedCode,
          studentUid,
          studentEmail
        );
        if (submitted) return submitted;
      }
      return alreadyAttemptedJoinResult(trimmedCode, trimmedName);
    }
    return { success: false, error: joinErrorMessageForDisplay(error, studentUid) };
  }
}
