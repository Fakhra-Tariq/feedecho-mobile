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

function addQuestionKey(ids: string[], value: unknown) {
  if (value === undefined || value === null) return;
  const text = String(value).trim();
  if (!text || ids.includes(text)) return;
  ids.push(text);
  const dashed = text.match(/^q-(\d+)$/i);
  const undashed = text.match(/^q(\d+)$/i);
  if (dashed) addQuestionKey(ids, `q${dashed[1]}`);
  if (undashed) addQuestionKey(ids, `q-${undashed[1]}`);
}

/** Same alias set Web uses (includes display index). Do not use this to pick the live lock. */
export function spaceRaceQuestionIdAliases(question: any, index: number) {
  const ids: string[] = [];
  addQuestionKey(ids, spaceRaceQuestionId(question, index));
  addQuestionKey(ids, question?.id);
  addQuestionKey(ids, question?.questionId);
  addQuestionKey(ids, question?._id);
  if (Number.isInteger(index)) {
    addQuestionKey(ids, `q${index}`);
    addQuestionKey(ids, `q-${index}`);
    addQuestionKey(ids, String(index));
  }
  return ids;
}

/**
 * Keys that belong to THIS question's RTDB node.
 * Display-index aliases (`1`, `q1`) are omitted unless they are this question's canonical id,
 * so Q2 cannot read Q1's `question_1` node.
 */
export function spaceRaceLiveQuestionKeys(question: any, index: number) {
  const canonical = spaceRaceQuestionId(question, index);
  const ids: string[] = [];
  addQuestionKey(ids, canonical);
  addQuestionKey(ids, question?.id);
  addQuestionKey(ids, question?.questionId);
  addQuestionKey(ids, question?._id);
  if (Number.isInteger(index)) {
    const qKey = `q${index}`;
    const qDash = `q-${index}`;
    const indexKey = String(index);
    if (canonical === qKey || canonical === qDash) {
      addQuestionKey(ids, qKey);
      addQuestionKey(ids, qDash);
    } else if (canonical === indexKey) {
      addQuestionKey(ids, indexKey);
    }
  }
  return ids;
}

export function isSubmittedLockNode(node: any) {
  return Boolean(node) && (node.submitted === true || node.submitted === 'true');
}

export function teamNodeAnswer(node: any) {
  if (!node) return '';
  const value = node.selectedOption ?? node.answer;
  if (value == null) return '';
  return String(value);
}

function optionIdentityValues(option: any): string[] {
  if (option == null) return [];
  if (typeof option === 'string' || typeof option === 'number') return [String(option)];
  const values = [option.text, option.label, option.value, option.id, option.optionId]
    .filter((value) => value != null && String(value).trim() !== '')
    .map((value) => String(value));
  return Array.from(new Set(values));
}

/** Match a stored team answer to an option by id/text/value — never by shuffle index. */
export function optionMatchesSelection(option: any, selected: unknown) {
  if (selected == null || String(selected).trim() === '') return false;
  const sel = String(selected).trim();
  return optionIdentityValues(option).some((value) => value === sel || value === String(selected));
}

export function questionOptionValues(question: any): string[] {
  const options = Array.isArray(question?.options) ? question.options : [];
  const values: string[] = [];
  options.forEach((option: any) => {
    optionIdentityValues(option).forEach((value) => {
      if (!values.includes(value)) values.push(value);
    });
  });
  return values;
}

/**
 * Live nodes that belong to this question. Canonical/id keys first; if those miss
 * (Web wrote a different alias), fall back to a unique option-text match.
 */
export function findLiveQuestionNodes(
  map: Record<string, any> | null | undefined,
  question: any,
  index: number
) {
  if (!map || typeof map !== 'object') return [] as any[];
  const keys = spaceRaceLiveQuestionKeys(question, index);
  const nodes: any[] = [];
  const seen = new Set<any>();
  keys.forEach((id) => {
    const node = map[`question_${id}`];
    if (node && !seen.has(node)) {
      seen.add(node);
      nodes.push(node);
    }
  });
  const hasUsableAnswer = nodes.some((node) => teamNodeAnswer(node).trim() !== '');
  if (hasUsableAnswer) return nodes;

  const optionValues = new Set(questionOptionValues(question));
  if (optionValues.size === 0) return nodes;
  const matches: any[] = [];
  Object.entries(map).forEach(([key, node]) => {
    if (!node || !String(key).startsWith('question_')) return;
    const answer = teamNodeAnswer(node);
    if (answer && optionValues.has(answer) && !seen.has(node)) {
      seen.add(node);
      matches.push(node);
    }
  });
  if (matches.length === 1) return [...nodes, matches[0]];
  return nodes;
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
