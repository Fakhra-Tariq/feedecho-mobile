import {
  activityBelongsToSession,
  activityJoinCodes,
  historyActivityIds,
  isLinkedSessionInactive,
  resolveSessionCurrentActivity,
} from './sessionActivityMatch';

const session = {
  id: 'sess1',
  sessionCode: 'ABC123',
  currentActivity: { type: 'spacerace', activityId: 'race1' },
  activityHistory: {
    h1: { type: 'quiz', activityId: 'quiz9', launchedAt: '1' },
  },
};

const cases: Array<{ name: string; run: () => boolean }> = [
  {
    name: 'race joinCode matches session',
    run: () => activityBelongsToSession({ joinCode: 'abc123', status: 'active' }, session),
  },
  {
    name: 'draft race with no codes does not belong',
    run: () => activityBelongsToSession({ status: 'draft' }, session) === false,
  },
  {
    name: 'other session code is ignored',
    run: () =>
      activityBelongsToSession({ joinCode: 'ZZZZZZ', status: 'active' }, session) === false,
  },
  {
    name: 'sessionId field matches',
    run: () => activityBelongsToSession({ sessionId: 'sess1', status: 'draft' }, session),
  },
  {
    name: 'current activity resolves space race id',
    run: () => {
      const cur = resolveSessionCurrentActivity(session);
      return cur?.kind === 'spacerace' && cur.id === 'race1';
    },
  },
  {
    name: 'join codes collect accessCode',
    run: () => activityJoinCodes({ accessCode: 'abc123' }).includes('ABC123'),
  },
  {
    name: 'history ids include launched quiz',
    run: () => historyActivityIds(session, 'quiz').has('quiz9'),
  },
  {
    name: 'history ids include current race',
    run: () => historyActivityIds(session, 'spacerace').has('race1'),
  },
  {
    name: 'ended session demotes matching ticket',
    run: () =>
      isLinkedSessionInactive(
        { joinCode: 'ABC123', status: 'active' },
        [{ id: 'sess1', sessionCode: 'ABC123', status: 'ended' }]
      ),
  },
  {
    name: 'active session does not demote ticket',
    run: () =>
      isLinkedSessionInactive(
        { joinCode: 'ABC123', status: 'active' },
        [{ id: 'sess1', sessionCode: 'ABC123', status: 'active' }]
      ) === false,
  },
];

let failed = 0;
for (const test of cases) {
  const passed = test.run();
  if (!passed) {
    failed += 1;
    console.error(`FAIL ${test.name}`);
  } else {
    console.log(`PASS ${test.name}`);
  }
}

if (failed) process.exit(1);
console.log('sessionActivityMatch: all checks passed');
