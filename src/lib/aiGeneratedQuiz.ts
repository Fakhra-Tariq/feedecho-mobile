export const AI_GENERATED_QUIZ_SOURCE = 'ai_generated';

const MIN_PROMPT_LENGTH = 5;
const REFUSAL_TEXT_RE =
  /only able to help|cannot assist|please provide a valid|not related to creating quiz|does not provide a clear topic|please describe a specific quiz topic/i;

export type QuizTypeLabel = 'Multiple Choice' | 'True / False' | 'Short Answer' | 'Mixed Type';

export function getQuizEditorTypeParam(quizType: string) {
  switch (quizType) {
    case 'Multiple Choice':
      return 'multiple-choice';
    case 'True / False':
      return 'true-false';
    case 'Short Answer':
      return 'short-answer';
    case 'Mixed Type':
    default:
      return 'mixed-type';
  }
}

export function quizTypeFromParam(param: string): QuizTypeLabel {
  switch (param) {
    case 'multiple-choice':
      return 'Multiple Choice';
    case 'true-false':
      return 'True / False';
    case 'short-answer':
      return 'Short Answer';
    case 'mixed-type':
    default:
      return 'Mixed Type';
  }
}

export function normalizeQuizTypeLabel(type?: string): QuizTypeLabel {
  const raw = String(type || '').toLowerCase();
  if (raw.includes('multiple')) return 'Multiple Choice';
  if (raw.includes('true')) return 'True / False';
  if (raw.includes('short')) return 'Short Answer';
  if (raw.includes('mixed')) return 'Mixed Type';
  return 'Mixed Type';
}

export function isPromptInvalid(value: string) {
  return String(value || '').trim().length < MIN_PROMPT_LENGTH;
}

function optionText(option: unknown) {
  if (typeof option === 'string') return option.trim();
  if (option && typeof option === 'object' && 'text' in option) {
    return String((option as { text?: string }).text || '').trim();
  }
  return '';
}

function isRealGeneratedQuestion(question: any) {
  if (!question || typeof question !== 'object') return false;
  const text = String(question.questionText || question.question || '').trim();
  if (!text || REFUSAL_TEXT_RE.test(text)) return false;

  const type = String(question.type || '').trim();
  if (type === 'multiple-choice' || type === 'mcq') {
    const options = Array.isArray(question.options)
      ? question.options.map(optionText).filter(Boolean)
      : [];
    return options.length >= 2;
  }
  if (type === 'true-false' || type === 'trueFalse') {
    const answer = question.correctAnswer;
    return answer === true || answer === false || answer === 'true' || answer === 'false';
  }
  if (type === 'short-answer' || type === 'shortAnswer') {
    return String(question.sampleAnswer || question.correctAnswer || '').trim().length > 0;
  }
  return text.length > 0;
}

export function isUsableAiQuizResponse(data: any) {
  if (!data || typeof data !== 'object') return false;
  if (data.error || (data.message && !data.questions?.length)) return false;
  const questions = Array.isArray(data.questions) ? data.questions : [];
  if (!questions.length) return false;
  return questions.every(isRealGeneratedQuestion);
}

function normalizeMcq(question: any, index: number) {
  const id = question.id || Date.now() + index;
  if (Array.isArray(question.options) && question.options[0] && typeof question.options[0] === 'object') {
    const options = question.options.map((option: any, optionIndex: number) => ({
      id: option.id || String.fromCharCode(97 + optionIndex),
      text: option.text || '',
      isCorrect: Boolean(option.isCorrect),
    }));
    while (options.length < 4) {
      options.push({
        id: String.fromCharCode(97 + options.length),
        text: '',
        isCorrect: false,
      });
    }
    return { id, questionText: question.questionText || '', options: options.slice(0, 4) };
  }

  const optionTexts = (question.options || []).map((option: any) =>
    typeof option === 'string' ? option : option?.text || ''
  );
  while (optionTexts.length < 4) optionTexts.push('');
  const correctIndex =
    typeof question.correctAnswer === 'number' && question.correctAnswer >= 0
      ? question.correctAnswer
      : 0;

  return {
    id,
    questionText: question.questionText || '',
    options: optionTexts.slice(0, 4).map((text: string, optionIndex: number) => ({
      id: String.fromCharCode(97 + optionIndex),
      text,
      isCorrect: optionIndex === correctIndex,
    })),
  };
}

function normalizeTrueFalse(question: any, index: number) {
  const answer = question.correctAnswer;
  let correctAnswer: boolean | null = null;
  if (answer === true || answer === 'true') correctAnswer = true;
  if (answer === false || answer === 'false') correctAnswer = false;
  return {
    id: question.id || Date.now() + index,
    questionText: question.questionText || '',
    correctAnswer,
  };
}

function normalizeShort(question: any, index: number) {
  return {
    id: question.id || Date.now() + index,
    questionText: question.questionText || '',
    sampleAnswer: question.sampleAnswer || question.correctAnswer || '',
  };
}

function normalizeMixed(question: any, index: number) {
  const id = question.id || Date.now() + index;
  const type = String(question.type || '');
  if (type === 'multiple-choice' || type === 'mcq') {
    if (Array.isArray(question.options) && question.options[0] && typeof question.options[0] === 'object') {
      const options = question.options.map((option: any) => option.text || '');
      const correctAnswer = question.options.findIndex((option: any) => option.isCorrect);
      return {
        id,
        type: 'multiple-choice',
        questionText: question.questionText || '',
        options,
        correctAnswer: correctAnswer >= 0 ? correctAnswer : 0,
      };
    }
    return {
      id,
      type: 'multiple-choice',
      questionText: question.questionText || '',
      options: question.options || ['', '', '', ''],
      correctAnswer: question.correctAnswer ?? 0,
    };
  }
  if (type === 'true-false' || type === 'trueFalse') {
    const answer = question.correctAnswer;
    return {
      id,
      type: 'true-false',
      questionText: question.questionText || '',
      correctAnswer: answer === true || answer === 'true',
    };
  }
  return {
    id,
    type: 'short-answer',
    questionText: question.questionText || '',
    sampleAnswer: question.sampleAnswer || question.correctAnswer || '',
  };
}

export function normalizeAiQuestionsForQuizType(questions: any[], quizType: QuizTypeLabel) {
  return (questions || []).map((question, index) => {
    switch (quizType) {
      case 'Multiple Choice':
        return normalizeMcq(question, index);
      case 'True / False':
        return normalizeTrueFalse(question, index);
      case 'Short Answer':
        return normalizeShort(question, index);
      case 'Mixed Type':
      default:
        return normalizeMixed(question, index);
    }
  });
}

export function buildEditingQuizFromAiResponse(data: any) {
  const quizType = normalizeQuizTypeLabel(data.type || 'Mixed Type');
  const questions = normalizeAiQuestionsForQuizType(data.questions || [], quizType);
  return {
    id: Date.now(),
    title: data.title || 'AI Generated Quiz',
    type: quizType,
    questions,
    questionCount: questions.length,
    createdDate: new Date().toISOString(),
    status: 'Draft',
    launched: false,
    source: AI_GENERATED_QUIZ_SOURCE,
  };
}

export function normalizeQuestionsForEditor(questions: any[], quizType: QuizTypeLabel) {
  return normalizeAiQuestionsForQuizType(questions || [], quizType);
}
