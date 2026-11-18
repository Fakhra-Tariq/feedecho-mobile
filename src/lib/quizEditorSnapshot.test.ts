import { quizEditorHeaderMode, serializeQuizEditorSnapshot } from './quizEditorSnapshot';

const base = {
  title: '  Warmup  ',
  quizType: 'Short Answer',
  questions: [
    {
      id: 'local-1',
      questionText: ' What is 2+2? ',
      sampleAnswer: '4',
      type: 'short-answer',
    },
  ],
};

const cases: Array<{ name: string; run: () => boolean }> = [
  {
    name: 'ignores local ids and title whitespace',
    run: () =>
      serializeQuizEditorSnapshot(base) ===
      serializeQuizEditorSnapshot({
        ...base,
        questions: [{ ...base.questions[0], id: 'other' }],
      }),
  },
  {
    name: 'detects title change',
    run: () =>
      serializeQuizEditorSnapshot(base) !==
      serializeQuizEditorSnapshot({ ...base, title: 'Other' }),
  },
  {
    name: 'create vs saved vs dirty',
    run: () => {
      const snap = serializeQuizEditorSnapshot(base);
      return (
        quizEditorHeaderMode(null, null, snap) === 'create' &&
        quizEditorHeaderMode('id1', snap, snap) === 'saved' &&
        quizEditorHeaderMode('id1', snap, serializeQuizEditorSnapshot({ ...base, title: 'X' })) ===
          'dirty'
      );
    },
  },
];

let failed = 0;
for (const row of cases) {
  const ok = row.run();
  if (!ok) {
    failed += 1;
    console.error('FAIL', row.name);
  }
}
if (failed) {
  throw new Error(`${failed} quizEditorSnapshot tests failed`);
}
console.log(`ok ${cases.length} quizEditorSnapshot tests`);
