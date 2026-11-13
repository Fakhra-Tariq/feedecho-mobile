/**
 * Detect quiz type from pasted/uploaded text structure (before parsing).
 * Ported from Web/client/src/utils/detectQuizContentType.js — behaviour unchanged.
 */

const MIXED_TAG_RE =
  /\[\s*(MCQ|MULTIPLE\s+CHOICE|TRUE\s*\/\s*FALSE|T\/F|SHORT\s*ANSWER)\s*\]/i;

const MCQ_OPTION_RE = /^[A-D]\)/i;

const SAMPLE_ANSWER_RE =
  /^(?:sample\s*answer|expected\s*answer|correct\s*answer)\s*:/i;

const ANSWER_LINE_RE = /^answer\s*:\s*(.*)$/i;

const normalizeAnswerValue = (raw: unknown) => String(raw || '').trim();

const isTrueFalseAnswer = (value: string) => {
  const v = normalizeAnswerValue(value).toLowerCase();
  return v === 'true' || v === 'false' || v.startsWith('true') || v.startsWith('false');
};

const isMcqLetterAnswer = (value: string) => {
  const v = normalizeAnswerValue(value);
  return /^[A-Da-d]$/.test(v);
};

export function detectQuizContentType(content: string) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.trim()) return null;

  if (MIXED_TAG_RE.test(text)) {
    return 'Mixed Type';
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.some((line) => MCQ_OPTION_RE.test(line))) {
    return 'Multiple Choice';
  }

  if (lines.some((line) => SAMPLE_ANSWER_RE.test(line))) {
    return 'Short Answer';
  }

  const answerValues = lines
    .map((line) => {
      const match = line.match(ANSWER_LINE_RE);
      return match ? normalizeAnswerValue(match[1]) : null;
    })
    .filter((value): value is string => value != null && value !== '');

  if (answerValues.length > 0) {
    const tfCount = answerValues.filter(isTrueFalseAnswer).length;
    const letterCount = answerValues.filter(isMcqLetterAnswer).length;
    const freeTextCount = answerValues.filter(
      (value) => !isTrueFalseAnswer(value) && !isMcqLetterAnswer(value)
    ).length;

    if (freeTextCount > 0) {
      return 'Short Answer';
    }

    if (letterCount > 0 && tfCount === 0) {
      return 'Multiple Choice';
    }

    if (tfCount > 0) {
      return 'True / False';
    }
  }

  return null;
}

export function getQuizTypeMismatchError(
  content: string,
  selectedType: string,
  source: 'pasted' | 'uploaded' = 'pasted'
) {
  const detected = detectQuizContentType(content);
  if (!detected || detected === selectedType) return null;

  const sourceLabel = source === 'uploaded' ? 'uploaded' : 'pasted';
  return `The ${sourceLabel} content appears to contain a ${detected} quiz, but "${selectedType}" is currently selected. Please select the correct quiz type and try again.`;
}
