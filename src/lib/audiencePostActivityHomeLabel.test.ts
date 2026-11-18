import { getAudiencePostActivityHomeLabel } from './audiencePostActivityHomeLabel';

const cases: Array<{
  name: string;
  profile: { uid?: string; guest?: boolean } | null;
  loading: boolean;
  expected: string | null;
}> = [
  { name: 'logged-in while loading', profile: { uid: 'u1' }, loading: true, expected: 'Back to Dashboard' },
  { name: 'logged-in ready', profile: { uid: 'u1' }, loading: false, expected: 'Back to Dashboard' },
  { name: 'unknown while loading', profile: null, loading: true, expected: null },
  { name: 'guest ready', profile: { uid: '', guest: true }, loading: false, expected: 'Back to Join Session' },
  { name: 'no profile ready', profile: null, loading: false, expected: 'Back to Join Session' },
];

let failed = 0;
for (const test of cases) {
  const actual = getAudiencePostActivityHomeLabel(test.profile, test.loading);
  if (actual !== test.expected) {
    failed += 1;
    console.error(`FAIL ${test.name}: expected ${JSON.stringify(test.expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`PASS ${test.name}`);
  }
}

if (failed) {
  process.exit(1);
}
console.log('audiencePostActivityHomeLabel: all checks passed');
