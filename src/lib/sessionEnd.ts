import {
  endOpenActivitiesForSession,
  lastEndedOpenActivityCount,
  type EndSessionActivityCatalog,
} from '@/lib/endSessionActivities';
import { endTeacherSession, type HostSession } from '@/lib/hostSessions';

/**
 * Same as Web Explore End Session:
 *   POST /sessions/:sessionId/end
 *   → server `endActiveActivityForSession` (join-code indexes + Admin SDK)
 *   → sessions/{id}.status = ended, currentActivity = null
 *
 * Must run that endpoint FIRST. Ending leftover history tickets via
 * POST /exit-tickets/:id/end before it calls `releaseSessionActivityClaim`,
 * which deletes `exit_ticket_codes/{sessionCode}` even when that id is not
 * currentActivity — then the session-end route cannot find the live ticket.
 *
 * After the session is ended, sweep any still-open rows for this session
 * (history / catalog) by activity id. `clearActivityFromActiveSession` is a
 * no-op once there is no active session.
 */
export async function endStandaloneSession(
  session: HostSession,
  teacherId: string,
  catalog: EndSessionActivityCatalog = {}
) {
  await endTeacherSession(session, teacherId);
  await endOpenActivitiesForSession(session, catalog, teacherId);
  return { endedActivityCount: lastEndedOpenActivityCount };
}
