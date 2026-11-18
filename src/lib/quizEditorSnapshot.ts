function optionSnapshot(question: any) {
  const options = question?.options;
  if (!Array.isArray(options)) return [];
  return options.map((opt: any, index: number) => {
    if (typeof opt === 'string') {
      return { t: opt.trim(), c: question.correctAnswer === index };
    }
    return {
      t: String(opt?.text ?? '').trim(),
      c: Boolean(opt?.isCorrect),
    };
  });
}

function questionSnapshot(question: any) {
  if (!question || typeof question !== 'object') return null;
  let correct = question.correctAnswer;
  if (correct === true || correct === 'true') correct = true;
  else if (correct === false || correct === 'false') correct = false;
  else if (typeof correct === 'number') correct = correct;
  else if (correct == null) correct = null;
  else correct = String(correct);

  return {
    text: String(question.questionText || '').trim(),
    type: question.type || null,
    sampleAnswer: String(question.sampleAnswer || question.modelAnswer || '').trim(),
    maxWords: question.maxWords ?? null,
    marks: question.marks ?? question.points ?? null,
    gradingNotes: String(question.gradingNotes || '').trim(),
    correctAnswer: correct,
    options: optionSnapshot(question),
  };
}

/** Stable JSON of title + questions. Ignores UI ids, timestamps, launched/status/source. */
export function serializeQuizEditorSnapshot({
  title,
  questions,
  quizType,
}: {
  title?: string;
  questions?: any[];
  quizType?: string | null;
}) {
  return JSON.stringify({
    title: String(title || '').trim(),
    type: quizType || null,
    questions: (questions || []).map(questionSnapshot),
  });
}

export type QuizEditorHeaderMode = 'create' | 'saved' | 'dirty';

export function quizEditorHeaderMode(
  persistedId: string | null | undefined,
  snapshot: string | null | undefined,
  current: string
): QuizEditorHeaderMode {
  if (!persistedId) return 'create';
  if (snapshot != null && current !== snapshot) return 'dirty';
  return 'saved';
}
