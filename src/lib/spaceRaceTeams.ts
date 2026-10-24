export const MIN_TEAMS = 2;
export const MAX_TEAMS = 10;
export const teamCountRangeError = `Number of teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}.`;

export function isAllowedTeamCount(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count >= MIN_TEAMS && count <= MAX_TEAMS;
}

export function teamCountChoices() {
  const choices: number[] = [];
  for (let count = MIN_TEAMS; count <= MAX_TEAMS; count += 1) choices.push(count);
  return choices;
}

export const SPACE_RACE_QUIZ_COUNTDOWNS = [30, 60, 120, 300, 600, 900, 1200, 1800];
export const SPACE_RACE_JOIN_MINUTES = [5, 10, 15, 20, 30, 45, 60];

export const DURATION_MISMATCH_MSG =
  'Join Duration must be equal to or greater than Quiz Duration';

export function quizDurationMinutes(countdownSeconds: number) {
  return Number(countdownSeconds) / 60;
}

export function isJoinShorterThanQuiz(joinMinutes: number, countdownSeconds: number) {
  return Number(joinMinutes) < quizDurationMinutes(countdownSeconds);
}

export function snapJoinUpToQuiz(countdownSeconds: number) {
  const needed = quizDurationMinutes(countdownSeconds);
  return (
    SPACE_RACE_JOIN_MINUTES.find((minutes) => minutes >= needed) ??
    SPACE_RACE_JOIN_MINUTES[SPACE_RACE_JOIN_MINUTES.length - 1]
  );
}

export function snapQuizDownToJoin(joinMinutes: number) {
  const allowed = SPACE_RACE_QUIZ_COUNTDOWNS.filter(
    (seconds) => seconds / 60 <= Number(joinMinutes)
  );
  return allowed[allowed.length - 1] ?? SPACE_RACE_QUIZ_COUNTDOWNS[0];
}

export function getRaceStatus(race: { status?: string } | null | undefined) {
  if (!race) return 'draft';
  const raw = race.status || 'draft';
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : String(raw);
  switch (normalized) {
    case 'active':
    case 'paused':
    case 'inactive':
    case 'running':
    case 'started':
    case 'live':
    case 'launched':
      return 'active';
    case 'completed':
    case 'ended':
    case 'finished':
      return 'completed';
    default:
      return 'draft';
  }
}

/** Same as Web AudienceQuizAttempt.getSpaceRaceQuestionId (do not sanitize hyphens). */
export function spaceRaceQuestionId(question: any, index: number) {
  if (question?.id !== undefined && question?.id !== null && String(question.id).trim() !== '') {
    return String(question.id);
  }
  if (
    question?.questionId !== undefined &&
    question?.questionId !== null &&
    String(question.questionId).trim() !== ''
  ) {
    return String(question.questionId);
  }
  if (question?._id !== undefined && question?._id !== null && String(question._id).trim() !== '') {
    return String(question._id);
  }
  return `q${index}`;
}

/** Same alias set Web uses so lock nodes match q0 / q-0 / id variants. */
export function spaceRaceQuestionIdAliases(question: any, index: number) {
  const ids: string[] = [];
  const add = (value: unknown) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text || ids.includes(text)) return;
    ids.push(text);
    const dashed = text.match(/^q-(\d+)$/i);
    const undashed = text.match(/^q(\d+)$/i);
    if (dashed) add(`q${dashed[1]}`);
    if (undashed) add(`q-${undashed[1]}`);
  };
  add(spaceRaceQuestionId(question, index));
  add(question?.id);
  add(question?.questionId);
  add(question?._id);
  if (Number.isInteger(index)) {
    add(`q${index}`);
    add(`q-${index}`);
    add(String(index));
  }
  return ids;
}

export function isSubmittedLockNode(node: any) {
  return Boolean(node) && (node.submitted === true || node.submitted === 'true');
}

export function teamScoreFromNode(node: any): number {
  if (typeof node === 'number' && Number.isFinite(node)) return node;
  if (node && typeof node === 'object' && typeof node.score === 'number') return node.score;
  return 0;
}

export function buildTeamStandings(
  numberOfTeams: number,
  teamScoresTree: Record<string, any> | null | undefined,
  participants: any[] = []
) {
  const teams = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Number(numberOfTeams) || 2));
  const rows = [];
  for (let teamId = 1; teamId <= teams; teamId += 1) {
    const fromScores = teamScoreFromNode(teamScoresTree?.[`team_${teamId}`]);
    const members = participants.filter((p) => Number(p.teamId) === teamId);
    const fromMembers = members.reduce(
      (max, p) => Math.max(max, typeof p.score === 'number' ? p.score : 0),
      0
    );
    rows.push({
      teamId,
      score: Math.max(fromScores, fromMembers),
      members: members.length,
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.teamId - b.teamId);
}
