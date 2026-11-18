import AsyncStorage from '@react-native-async-storage/async-storage';

const PARTICIPANT_KEY = 'spaceRaceParticipant';

export function normalizeTeamId(teamId: unknown) {
  if (teamId === undefined || teamId === null || teamId === '') return null;
  const n = Number(teamId);
  return Number.isFinite(n) ? n : null;
}

export async function saveSpaceRaceParticipant(participant: any) {
  if (!participant?.id) return;
  const normalized = {
    ...participant,
    teamId: normalizeTeamId(participant.teamId),
  };
  await AsyncStorage.setItem(PARTICIPANT_KEY, JSON.stringify(normalized));
}

export async function loadSpaceRaceParticipant(expectedRaceId: string | null = null) {
  const raw = await AsyncStorage.getItem(PARTICIPANT_KEY);
  if (!raw) return null;
  try {
    const participant = JSON.parse(raw);
    if (
      expectedRaceId &&
      participant?.raceId &&
      String(participant.raceId) !== String(expectedRaceId)
    ) {
      return null;
    }
    if (participant) participant.teamId = normalizeTeamId(participant.teamId);
    return participant;
  } catch {
    return null;
  }
}

export async function clearSpaceRaceParticipant() {
  await AsyncStorage.removeItem(PARTICIPANT_KEY);
}

const quizEndTimeMem = new Map<string, string>();

export function spaceRaceQuizEndTimeKey(raceId: string) {
  return `spaceRaceEndTime:${raceId}`;
}

/** In-memory + AsyncStorage so the question-screen header does not wait on RTDB. */
export function rememberSpaceRaceQuizEndTime(raceId: string, iso: string) {
  const id = String(raceId || '').trim();
  const end = String(iso || '').trim();
  if (!id || !end) return;
  quizEndTimeMem.set(id, end);
  void AsyncStorage.setItem(spaceRaceQuizEndTimeKey(id), end);
}

export function peekSpaceRaceQuizEndTime(raceId: string) {
  return quizEndTimeMem.get(String(raceId || '').trim()) || null;
}
