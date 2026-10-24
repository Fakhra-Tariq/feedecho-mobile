import { finishQuiz } from '@/lib/hostQuizzes';
import { isQuizExpired, type QuizExpiryInput } from '@/lib/quizExpiry';

const inFlight = new Set<string>();
const succeeded = new Set<string>();

/** Same as Web `autoFinishExpiredQuiz`: POST /quizzes/:id/finish once per expired launch. */
export async function autoFinishExpiredQuiz(
  quiz: (QuizExpiryInput & { id?: string }) | null | undefined
) {
  const id = quiz?.id;
  if (!id) return false;

  if (!isQuizExpired(quiz)) {
    succeeded.delete(id);
    return false;
  }

  if (succeeded.has(id) || inFlight.has(id)) return false;

  inFlight.add(id);
  try {
    await finishQuiz(id);
    succeeded.add(id);
    return true;
  } catch (error) {
    console.warn('autoFinishExpiredQuiz failed', {
      quizId: id,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    inFlight.delete(id);
  }
}
