/**
 * Copy & Paste quiz parse + placeholders.
 * Ported from Web/client/src/components/CopyPasteQuizModal.js — rules unchanged.
 */

export const COPY_PASTE_PLACEHOLDERS: Record<string, string> = {
  'Multiple Choice': `Paste your multiple choice questions in this format:

1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Answer: C

2. Which planet is known as the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B`,

  'True / False': `Paste your true/false questions in this format:

1. The Earth is flat.
Answer: False

2. The sun rises in the east.
Answer: True

3. Water freezes at 0°C.
Answer: True`,

  'Short Answer': `Paste your short answer questions in this format:

1. What is the chemical symbol for water?
Sample Answer: H2O

2. Who wrote Romeo and Juliet?
Sample Answer: William Shakespeare

3. What is the largest planet in our solar system?
Sample Answer: Jupiter`,

  'Mixed Type': `Paste your mixed-type questions in this format (use any 2 or all 3 tags, in any order):

[MCQ]
1. What is the capital of France?
A) London
B) Berlin
C) Paris
D) Madrid
Answer: C

[TRUE/FALSE]
2. The Earth is flat.
Answer: False

[SHORT ANSWER]
3. What is the chemical symbol for water?
Sample Answer: H2O`,
};

/** Same as Web quizQuestionNormalization.ensureQuestionIds. */
export function ensureQuestionIds(questions: any[]) {
  const list = Array.isArray(questions) ? questions : [];
  const seen = new Set<string>();

  return list.map((question, index) => {
    const raw = question?.id ?? question?.questionId;
    const candidate =
      raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? String(raw)
        : null;

    let id = candidate;
    if (!id || seen.has(id)) {
      id = `q-${index}`;
    }
    seen.add(id);

    return {
      ...question,
      id,
    };
  });
}

const normalizeMixedTag = (raw: string) => {
  const key = String(raw || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (key === 'MCQ' || key === 'MULTIPLE CHOICE') return 'MCQ';
  if (key === 'TRUE/FALSE' || key === 'TRUE / FALSE' || key === 'T/F') return 'TRUE/FALSE';
  if (key === 'SHORT ANSWER' || key === 'SHORTANSWER') return 'SHORT ANSWER';
  if (key === 'LONG ANSWER' || key === 'LONGANSWER') return 'LONG ANSWER';
  return null;
};

const parseMixedMultipleChoice = (lines: string[]) => {
  const questions: any[] = [];
  let currentQuestion: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\d+\./.test(line)) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        id: Date.now() + questions.length,
        type: 'multiple-choice',
        questionText: line.replace(/^\d+\.\s*/, ''),
        options: ['', '', '', ''],
        correctAnswer: 0,
      };
    } else if (/^[A-D]\)/i.test(line) && currentQuestion) {
      const optionIndex = line[0].toUpperCase().charCodeAt(0) - 65;
      const optionText = line.replace(/^[A-D]\)\s*/i, '');
      if (optionIndex >= 0 && optionIndex < 4) {
        currentQuestion.options[optionIndex] = optionText;
      }
    } else if (/^answer:\s*/i.test(line) && currentQuestion) {
      const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toUpperCase();
      if (letter >= 'A' && letter <= 'D') {
        currentQuestion.correctAnswer = letter.charCodeAt(0) - 65;
      }
    }
  }

  if (currentQuestion) questions.push(currentQuestion);
  return questions;
};

const parseMixedTrueFalse = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '');
    let correctAnswer = true;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j].toLowerCase();
      if (nextLine.includes('answer:')) {
        if (nextLine.includes('false')) correctAnswer = false;
        else if (nextLine.includes('true')) correctAnswer = true;
        break;
      }
    }

    questions.push({
      id: Date.now() + questions.length,
      type: 'true-false',
      questionText,
      correctAnswer,
    });
  }

  return questions;
};

const parseMixedShortAnswer = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '');
    let sampleAnswer = '';

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j];
      if (nextLine.toLowerCase().includes('sample answer:')) {
        sampleAnswer = nextLine.replace(/sample answer:\s*/i, '');
        break;
      }
    }

    questions.push({
      id: Date.now() + questions.length,
      type: 'short-answer',
      questionText,
      sampleAnswer,
    });
  }

  return questions;
};

const parseMixedType = (content: string) => {
  const questions: any[] = [];
  const tagRegex =
    /\[\s*(MCQ|MULTIPLE\s+CHOICE|TRUE\s*\/\s*FALSE|T\/F|SHORT\s*ANSWER|LONG\s*ANSWER)\s*\]/gi;
  const sections: { kind: string; bodyStart: number; tagStart: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    const kind = normalizeMixedTag(match[1]);
    if (!kind) continue;
    sections.push({
      kind,
      bodyStart: match.index + match[0].length,
      tagStart: match.index,
    });
  }

  if (sections.length === 0) {
    return [];
  }

  for (let i = 0; i < sections.length; i++) {
    const { kind, bodyStart } = sections[i];
    if (kind === 'LONG ANSWER') continue;

    const bodyEnd = i + 1 < sections.length ? sections[i + 1].tagStart : content.length;
    const lines = content
      .slice(bodyStart, bodyEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (kind === 'MCQ') {
      questions.push(...parseMixedMultipleChoice(lines));
    } else if (kind === 'TRUE/FALSE') {
      questions.push(...parseMixedTrueFalse(lines));
    } else if (kind === 'SHORT ANSWER') {
      questions.push(...parseMixedShortAnswer(lines));
    }
  }

  return questions;
};

const parseMultipleChoice = (lines: string[]) => {
  const questions: any[] = [];
  let currentQuestion: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d+\./.test(line)) {
      if (currentQuestion) {
        questions.push(currentQuestion);
      }
      currentQuestion = {
        id: Date.now() + questions.length,
        questionText: line.replace(/^\d+\.\s*/, ''),
        options: [
          { id: 'a', text: '', isCorrect: false },
          { id: 'b', text: '', isCorrect: false },
          { id: 'c', text: '', isCorrect: false },
          { id: 'd', text: '', isCorrect: false },
        ],
      };
    } else if (/^[A-D]\)/.test(line) && currentQuestion) {
      const optionId = line[0].toLowerCase();
      const optionText = line.replace(/^[A-D]\)\s*/, '');
      const optionIndex = optionId.charCodeAt(0) - 97;

      if (optionIndex < 4) {
        currentQuestion.options[optionIndex].text = optionText;
      }
    } else if (/^answer:\s*/i.test(line) && currentQuestion) {
      const letter = line.replace(/^answer:\s*/i, '').trim().charAt(0).toLowerCase();
      if (letter >= 'a' && letter <= 'd') {
        currentQuestion.options.forEach((opt: any) => {
          opt.isCorrect = opt.id === letter;
        });
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion);
  }

  return questions;
};

const parseTrueFalse = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d+\./.test(line)) {
      const questionText = line.replace(/^\d+\.\s*/, '');
      let correctAnswer: string | null = null;

      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].trim().toLowerCase();
        if (nextLine.includes('answer:')) {
          if (nextLine.includes('true')) {
            correctAnswer = 'true';
          } else if (nextLine.includes('false')) {
            correctAnswer = 'false';
          }
          break;
        }
      }

      questions.push({
        id: Date.now() + questions.length,
        questionText,
        correctAnswer,
      });
    }
  }

  return questions;
};

const parseShortAnswer = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d+\./.test(line)) {
      const questionText = line.replace(/^\d+\.\s*/, '');
      let sampleAnswer = '';

      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine.toLowerCase().includes('sample answer:')) {
          sampleAnswer = nextLine.replace(/sample answer:\s*/i, '');
          break;
        }
      }

      questions.push({
        id: Date.now() + questions.length,
        questionText,
        sampleAnswer,
      });
    }
  }

  return questions;
};

/** Same as Web CopyPasteQuizModal.parseContent. */
export function parsePastedQuizContent(content: string, type: string) {
  if (type === 'Mixed Type') {
    return parseMixedType(content);
  }

  const lines = content.split('\n').filter((line) => line.trim());

  switch (type) {
    case 'Multiple Choice':
      return parseMultipleChoice(lines);
    case 'True / False':
      return parseTrueFalse(lines);
    case 'Short Answer':
      return parseShortAnswer(lines);
    default:
      return [];
  }
}
