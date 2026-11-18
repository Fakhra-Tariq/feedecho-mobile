import { blockMobileLaunchIfBusy } from '@/lib/activeActivity';
import type { LiveHostActivity } from '@/lib/liveHostActivity';

type LaunchQuizRef = { id?: string | null };

/**
 * Same launch gate as the Library card: active session, then live-activity busy check.
 * Caller opens LaunchQuizSettingsModal or CreateSessionModal.
 */
export function openHostQuizLaunch({
  activeSession,
  liveActivity,
  quiz,
}: {
  activeSession?: { sessionCode?: string | null } | null;
  liveActivity?: LiveHostActivity | null;
  quiz?: LaunchQuizRef | null;
}): { ok: true } | { ok: false; reason: 'no-session' | 'busy' } {
  if (!activeSession?.sessionCode) {
    return { ok: false, reason: 'no-session' };
  }
  if (blockMobileLaunchIfBusy(liveActivity, { type: 'quiz', id: quiz?.id })) {
    return { ok: false, reason: 'busy' };
  }
  return { ok: true };
}
