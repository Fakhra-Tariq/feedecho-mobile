import assert from 'assert';

import {
  isSpaceRaceEndedByTeacher,
  isSpaceRaceQuizPath,
  resolveSpaceRaceAudiencePhase,
} from './spaceRaceAudiencePhase';

assert.equal(isSpaceRaceQuizPath('/audience/space-race'), false);
assert.equal(isSpaceRaceQuizPath('/audience/space-race?raceId=abc'), false);
assert.equal(isSpaceRaceQuizPath('/audience/space-race-quiz'), true);
assert.equal(isSpaceRaceQuizPath('/audience/space-race-quiz?raceId=abc'), true);

const startedAt = '2026-01-01T00:00:00.000Z';
const startMs = Date.parse(startedAt);
const race = { startedAt, settings: { joinDuration: 10 }, status: 'active' };
const joinEnd = startMs + 10 * 60 * 1000;
const quizEnd = startMs + 20 * 60 * 1000;

assert.equal(
  resolveSpaceRaceAudiencePhase({
    completed: true,
    insideQuiz: true,
    race: { ...race, status: 'completed' },
    nowMs: joinEnd + 1,
    quizEndMs: quizEnd,
  }),
  'completed'
);

assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: false,
    race: { ...race, status: 'completed' },
    nowMs: startMs + 1000,
  }),
  'closed'
);
assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: true,
    race: { ...race, status: 'completed' },
    nowMs: startMs + 1000,
    quizEndMs: quizEnd,
  }),
  'race_ended'
);

assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: true,
    race: { ...race, status: 'ended' },
    nowMs: quizEnd + 1,
    quizEndMs: quizEnd,
  }),
  'race_ended'
);

assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: true,
    race,
    nowMs: joinEnd,
    quizEndMs: quizEnd,
  }),
  'times_up'
);
assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: true,
    race,
    nowMs: quizEnd,
    quizEndMs: quizEnd,
  }),
  'times_up'
);

assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: false,
    race,
    nowMs: joinEnd,
    quizEndMs: quizEnd,
  }),
  'closed'
);

assert.equal(
  resolveSpaceRaceAudiencePhase({
    insideQuiz: false,
    race,
    nowMs: startMs + 1000,
    quizEndMs: quizEnd,
  }),
  'open'
);

assert.equal(isSpaceRaceEndedByTeacher({ status: 'completed' }), true);
assert.equal(isSpaceRaceEndedByTeacher({ status: 'ended' }), true);
assert.equal(isSpaceRaceEndedByTeacher({ status: 'active' }), false);

console.log('spaceRaceAudiencePhase.test.ts ok');
