import assert from 'assert';

import {
  getJoinDurationMinutes,
  getJoinWindowEndMs,
  isJoinWindowExpired,
} from './spaceRaceJoinWindow';

const startedAt = '2026-01-01T00:00:00.000Z';
const startMs = Date.parse(startedAt);

assert.equal(getJoinDurationMinutes(undefined), null);
assert.equal(getJoinDurationMinutes({ joinDuration: 0 }), null);
assert.equal(isJoinWindowExpired({ startedAt, settings: {} }, startMs + 1e12), false);

const race = { startedAt, settings: { joinDuration: 30 } };
assert.equal(getJoinWindowEndMs(race), startMs + 30 * 60 * 1000);
assert.equal(isJoinWindowExpired(race, startMs + 29 * 60 * 1000), false);
assert.equal(isJoinWindowExpired(race, startMs + 30 * 60 * 1000), true);
assert.equal(isJoinWindowExpired({ settings: { joinDuration: 5 } }, Date.now()), false);

console.log('spaceRaceJoinWindow.test.ts ok');
