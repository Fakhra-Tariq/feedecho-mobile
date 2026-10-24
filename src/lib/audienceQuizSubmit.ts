import { apiRequest, ApiError } from '@/lib/api';
import { saveLocalQuizSubmission } from '@/lib/audienceQuizSession';

const SUBMIT_MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1500, 3000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAnswersForSubmit = (answers: unknown) => {
  if (answers == null) return {};
  if (Array.isArray(answers)) {
    const mapped: Record<number, unknown> = {};
    answers.forEach((value, index) => {
      mapped[index] = value;
    });
    return mapped;
  }
  if (typeof answers === 'object') return answers;
  return {};
};

const isRetryableError = (error: unknown) => {
  if (!(error instanceof ApiError)) return true;
  return error.status >= 500 || error.status === 408 || error.status === 429;
};

/**
 * Same as Web submitQuizWithRetry → POST /quiz-submissions/{quizId}/submit (no auth).
 * Guest payloads omit studentUid/studentEmail; logged-in include them when present.
 */
export async function submitQuizWithRetry(
  quizId: string,
  submissionData: Record<string, unknown>,
  { maxRetries = SUBMIT_MAX_RETRIES }: { maxRetries?: number } = {}
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await apiRequest<{
        success?: boolean;
        data?: any;
        error?: string;
      }>(`/quiz-submissions/${quizId}/submit`, {
        method: 'POST',
        auth: false,
        body: {
          ...submissionData,
          answers: normalizeAnswersForSubmit(submissionData.answers),
        },
      });

      if (response.success) {
        return { success: true as const, data: response.data, attempt: attempt + 1 };
      }

      lastError = new ApiError(response.error || 'Server rejected submission', 400, response);
      if (attempt < maxRetries - 1 && isRetryableError(lastError)) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1 && isRetryableError(error)) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
        continue;
      }
      break;
    }
  }

  const serverMsg =
    lastError instanceof ApiError
      ? String(
          (lastError.data as any)?.error ||
            (lastError.data as any)?.message ||
            lastError.message ||
            'Submission failed'
        )
      : lastError instanceof Error
        ? lastError.message
        : 'Submission failed';

  return {
    success: false as const,
    error: serverMsg,
    status: lastError instanceof ApiError ? lastError.status : null,
  };
}

export { saveLocalQuizSubmission };
