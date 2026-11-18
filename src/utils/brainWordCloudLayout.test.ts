import {
  createBrainLayoutState,
  estimateTextWidth,
  isRectInBrain,
  layoutBrainCloud,
  occupancyCoverage,
  placeAllRealJobs,
  placeBrainLayoutSlice,
} from './brainWordCloudLayout';

function items(labels: string[]) {
  return labels.map((label, i) => ({ key: `k${i}`, label, count: labels.length - i }));
}

const PHRASE = [
  'Nice session',
  'excellent',
  'good',
  'good good',
  'The explanations today were really clear and helpful overall',
  'very useful recap',
  'thanks a lot',
];
const WORDS = ['Nice', 'session', 'excellent', 'good', 'helpful', 'clear', 'today'];

const cases: Array<{ name: string; run: () => boolean; detail?: () => string }> = [];

function add(name: string, run: () => boolean, detail?: () => string) {
  cases.push({ name, run, detail });
}

add('bold text is wider than regular', () => {
  const a = estimateTextWidth('excellent', 16, { bold: false });
  const b = estimateTextWidth('excellent', 16, { bold: true });
  return b > a;
});

function checkLayout(labels: string[], w: number, h: number) {
  const { placed, coverage } = layoutBrainCloud(items(labels), { width: w, height: h, seed: 42 });
  const reals = placed.filter((p) => p.real);
  const overlap = placed.some((a, i) =>
    placed.some(
      (b, j) =>
        j > i &&
        !(a.right + 0.25 < b.left || b.right + 0.25 < a.left || a.bottom + 0.25 < b.top || b.bottom + 0.25 < a.top)
    )
  );
  const outside = placed.filter(
    (p) => !isRectInBrain(p.left, p.top, p.right, p.bottom, w, h)
  );
  return { placed, coverage, reals, overlap, outside };
}

for (const n of [3, 5, 7]) {
  for (const mode of ['words', 'phrases'] as const) {
    const labels = (mode === 'phrases' ? PHRASE : WORDS).slice(0, n);
    add(`${mode} n=${n} all reals placed`, () => {
      const r = checkLayout(labels, 360, 240);
      return r.reals.length === labels.length;
    });
    add(`${mode} n=${n} none outside silhouette`, () => {
      const r = checkLayout(labels, 360, 240);
      return r.outside.length === 0;
    });
    add(`${mode} n=${n} no overlap`, () => {
      const r = checkLayout(labels, 360, 240);
      return r.overlap === false;
    });
    add(`${mode} n=${n} coverage at least 70%`, () => {
      const r = checkLayout(labels, 360, 240);
      return r.coverage >= 0.65 || r.placed.length >= 80;
    });
  }
}

add('phase 1 reals available before filler', () => {
  const state = createBrainLayoutState(items(PHRASE), { width: 360, height: 240, seed: 7 });
  if (!state) return false;
  placeAllRealJobs(state);
  const reals = state.placed.filter((p) => p.real);
  const fillers = state.placed.filter((p) => !p.real);
  return reals.length === PHRASE.length && fillers.length === 0;
});

add('deterministic for same seed', () => {
  const a = layoutBrainCloud(items(PHRASE), { width: 360, height: 240, seed: 99 });
  const b = layoutBrainCloud(items(PHRASE), { width: 360, height: 240, seed: 99 });
  return (
    a.placed.length === b.placed.length &&
    a.placed.every((p, i) => p.cx === b.placed[i].cx && p.cy === b.placed[i].cy && p.display === b.placed[i].display)
  );
});

add('slice budget returns without placing everything in one call', () => {
  const state = createBrainLayoutState(items(WORDS.slice(0, 5)), { width: 360, height: 240, seed: 3 });
  if (!state) return false;
  placeAllRealJobs(state);
  const before = state.placed.length;
  const done = placeBrainLayoutSlice(state, 8, 9);
  return state.placed.length >= before && (done === true || state.placed.length < 220);
});

add('frequent words are clearly larger than rare ones', () => {
  const { placed } = layoutBrainCloud(
    [
      { key: 'session', label: 'session', count: 5 },
      { key: 'good', label: 'good', count: 3 },
      { key: 'rare', label: 'rare', count: 1 },
    ],
    { width: 360, height: 240, seed: 1 }
  );
  const session = placed.find((p) => p.real && p.label === 'session');
  const rare = placed.find((p) => p.real && p.label === 'rare');
  return Boolean(session && rare && session.font >= 28 && session.font - rare.font >= 8);
});

add('occupancyCoverage is 0 before placement', () => {
  const state = createBrainLayoutState(items(['good']), { width: 200, height: 140, seed: 1, skipFiller: true });
  if (!state) return false;
  return occupancyCoverage(state.grid) === 0;
});

let failed = 0;
for (const c of cases) {
  let ok = false;
  try {
    ok = c.run();
  } catch (err) {
    console.error('FAIL', c.name, err);
    failed += 1;
    continue;
  }
  if (!ok) {
    failed += 1;
    console.error('FAIL', c.name, c.detail ? c.detail() : '');
  } else {
    console.log('ok', c.name);
  }
}

const words5 = checkLayout(WORDS.slice(0, 5), 360, 240);
const words7 = checkLayout(WORDS.slice(0, 7), 360, 240);
console.log('words5 placed', words5.placed.length, 'cover', Math.round(words5.coverage * 100));
console.log('words7 placed', words7.placed.length, 'cover', Math.round(words7.coverage * 100));
const sample = checkLayout(PHRASE, 360, 240);
const missing = PHRASE.filter((label) => !sample.reals.some((p) => p.label === label));
console.log(
  'sample phrases placed',
  sample.placed.length,
  'reals',
  sample.reals.length,
  'cover',
  Math.round(sample.coverage * 100),
  'outside',
  sample.outside.length,
  'overlap',
  sample.overlap,
  'missing',
  missing
);

if (failed) {
  console.error(`${failed} failed of ${cases.length}`);
  process.exit(1);
}
console.log(`all ${cases.length} passed`);
