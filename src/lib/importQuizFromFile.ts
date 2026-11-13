/**
 * Extract text from an uploaded quiz file and parse questions from that text.
 * Supports the same plain-text formats as Copy & Paste.
 * Ported from Web/client/src/utils/importQuizFromFile.js — parse rules unchanged.
 *
 * React Native: read via expo-file-system (content:// / iCloud URIs). PDF uses
 * pdf.js fake-worker (import pdf.worker onto globalThis) — no browser Worker.
 */

import * as FileSystem from 'expo-file-system/legacy';

import { getQuizTypeMismatchError } from '@/lib/detectQuizContentType';

export type QuizImportFile = {
  name: string;
  uri: string;
  size?: number;
};

const PARSE_FAILED_MESSAGE =
  'Could not parse the file content. Please check the file format and try again.';

function toFriendlyExtractError(error: unknown, fallback = PARSE_FAILED_MESSAGE) {
  const message = error instanceof Error ? error.message : String(error || '');
  console.error('[importQuizFromFile]', message);
  if (
    /legacy \.doc files are not supported/i.test(message) ||
    /no readable text found/i.test(message) ||
    /no file provided/i.test(message)
  ) {
    return error instanceof Error ? error : new Error(message || fallback);
  }
  return new Error(fallback);
}

function base64ToUint8Array(base64: string) {
  const clean = String(base64 || '').replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(clean, 'base64'));
  }
  throw new Error('Failed to read file');
}

async function resolveReadableUri(file: QuizImportFile) {
  const uri = String(file.uri || '');
  if (uri.startsWith('file://')) return uri;
  const ext = getExtension(file.name) || 'bin';
  const dest = `${FileSystem.cacheDirectory}quiz-import-${Date.now()}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: file.uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

const readFileAsArrayBuffer = async (file: QuizImportFile) => {
  const uri = await resolveReadableUri(file);
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToUint8Array(base64);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (fsError) {
    // Prefer fetch when the cache copy/read is unavailable (content://).
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Failed to read file');
    return response.arrayBuffer();
  }
};

const readFileAsText = async (file: QuizImportFile) => {
  const uri = await resolveReadableUri(file);
  try {
    return String(
      (await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      })) || ''
    );
  } catch (fsError) {
    // Prefer fetch when UTF-8 FileSystem read is unavailable.
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Failed to read file');
    return String((await response.text()) || '');
  }
};

const getExtension = (fileName = '') => {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
};

async function loadPdfJs() {
  const [pdfjsModule, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.js'),
    import('pdfjs-dist/legacy/build/pdf.worker.js'),
  ]);
  const pdfjs = (pdfjsModule as any).default || pdfjsModule;
  const worker = (workerModule as any).default || workerModule;
  // Run pdf.js on the JS thread (no browser Worker in React Native).
  (globalThis as any).pdfjsWorker = worker;
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.js';
  }
  return pdfjs;
}

const extractTextFromPdf = async (arrayBuffer: ArrayBuffer) => {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(arrayBuffer);
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    const lineParts: string[] = [];
    const lines: string[] = [];
    content.items.forEach((item: any) => {
      const y = item.transform ? item.transform[5] : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) {
        lines.push(lineParts.join(' ').trim());
        lineParts.length = 0;
      }
      if (item.str) lineParts.push(item.str);
      if (y != null) lastY = y;
    });
    if (lineParts.length) lines.push(lineParts.join(' ').trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }

  return pages.filter(Boolean).join('\n');
};

const extractTextFromDocx = async (arrayBuffer: ArrayBuffer) => {
  const mammothModule = await import('mammoth');
  const mammoth = (mammothModule as any).default || mammothModule;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result?.value || '';
};

const extractTextFromSpreadsheet = async (arrayBuffer: ArrayBuffer) => {
  const xlsxModule = await import('xlsx');
  const XLSX = (xlsxModule as any).default || xlsxModule;
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const lines: string[] = [];

  workbook.SheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    rows.forEach((row: unknown) => {
      if (!Array.isArray(row)) return;
      const cells = row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
      if (cells.length) lines.push(cells.join(' '));
    });
  });

  return lines.join('\n');
};

export const normalizeExtractedQuizText = (rawText = '') => {
  let text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  text = text.replace(/([^\n])\s+(\d+\.\s+)/g, '$1\n$2');
  text = text.replace(/([^\n])\s+([A-D]\))/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Sample\s+Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Expected\s+Answer\s*:)/gi, '$1\n$2');
  text = text.replace(/([^\n])\s+(Correct\s+Answer\s*:)/gi, '$1\n$2');
  text = text.replace(
    /([^\n])\s*(\[(?:MCQ|TRUE\s*\/\s*FALSE|SHORT\s*ANSWER|LONG\s*ANSWER)\])/gi,
    '$1\n$2'
  );
  text = text.replace(
    /(\[(?:MCQ|TRUE\s*\/\s*FALSE|SHORT\s*ANSWER|LONG\s*ANSWER)\])\s*/gi,
    '$1\n'
  );

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
};

export async function extractTextFromQuizFile(file: QuizImportFile) {
  if (!file) throw new Error('No file provided');

  const ext = getExtension(file.name);

  try {
    if (ext === 'txt') {
      return normalizeExtractedQuizText(await readFileAsText(file));
    }

    if (ext === 'doc') {
      throw new Error(
        'Legacy .doc files are not supported. Please save as .docx or .txt and try again.'
      );
    }

    const buffer = await readFileAsArrayBuffer(file);

    if (ext === 'pdf') {
      return normalizeExtractedQuizText(await extractTextFromPdf(buffer));
    }

    if (ext === 'docx') {
      return normalizeExtractedQuizText(await extractTextFromDocx(buffer));
    }

    if (ext === 'xls' || ext === 'xlsx') {
      return normalizeExtractedQuizText(await extractTextFromSpreadsheet(buffer));
    }

    return normalizeExtractedQuizText(await readFileAsText(file));
  } catch (error) {
    throw toFriendlyExtractError(error);
  }
}

const parseMultipleChoice = (lines: string[]) => {
  const questions: any[] = [];
  let currentQuestion: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^\d+\./.test(line)) {
      if (currentQuestion) questions.push(currentQuestion);
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
    } else if (/^[A-D]\)/i.test(line) && currentQuestion) {
      const optionId = line[0].toLowerCase();
      const optionText = line.replace(/^[A-D]\)\s*/i, '');
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

  if (currentQuestion) questions.push(currentQuestion);
  return questions;
};

const parseTrueFalse = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '');
    let correctAnswer: string | null = null;

    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const nextLine = lines[j].trim().toLowerCase();
      if (nextLine.includes('answer:')) {
        if (nextLine.includes('true')) correctAnswer = 'true';
        else if (nextLine.includes('false')) correctAnswer = 'false';
        break;
      }
    }

    questions.push({
      id: Date.now() + questions.length,
      questionText,
      correctAnswer,
    });
  }

  return questions;
};

const SHORT_ANSWER_MARKER =
  /^(?:sample\s*answer|expected\s*answer|correct\s*answer|answer)\s*:\s*(.*)$/i;

const extractShortAnswerValue = (lines: string[], questionIndex: number) => {
  for (let j = questionIndex + 1; j < lines.length; j++) {
    const nextLine = String(lines[j] || '').trim();
    if (!nextLine) continue;
    if (/^\d+\.\s*/.test(nextLine)) break;

    const match = nextLine.match(SHORT_ANSWER_MARKER);
    if (!match) continue;

    let sampleAnswer = String(match[1] || '').trim();
    if (!sampleAnswer) {
      for (let k = j + 1; k < lines.length; k++) {
        const following = String(lines[k] || '').trim();
        if (!following) continue;
        if (/^\d+\.\s*/.test(following) || SHORT_ANSWER_MARKER.test(following)) break;
        sampleAnswer = following;
        break;
      }
    }
    return sampleAnswer;
  }
  return '';
};

const parseShortAnswer = (lines: string[]) => {
  const questions: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '').trim();
    const sampleAnswer = extractShortAnswerValue(lines, i);

    questions.push({
      id: Date.now() + questions.length,
      questionText,
      sampleAnswer,
      correctAnswer: sampleAnswer,
    });
  }

  return questions;
};

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
    const line = String(lines[i] || '').trim();
    if (!/^\d+\./.test(line)) continue;

    const questionText = line.replace(/^\d+\.\s*/, '').trim();
    const sampleAnswer = extractShortAnswerValue(lines, i);

    questions.push({
      id: Date.now() + questions.length,
      type: 'short-answer',
      questionText,
      sampleAnswer,
      correctAnswer: sampleAnswer,
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

  if (sections.length === 0) return [];

  for (let i = 0; i < sections.length; i++) {
    const { kind, bodyStart } = sections[i];
    if (kind === 'LONG ANSWER') continue;

    const bodyEnd = i + 1 < sections.length ? sections[i + 1].tagStart : content.length;
    const lines = content
      .slice(bodyStart, bodyEnd)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (kind === 'MCQ') questions.push(...parseMixedMultipleChoice(lines));
    else if (kind === 'TRUE/FALSE') questions.push(...parseMixedTrueFalse(lines));
    else if (kind === 'SHORT ANSWER') questions.push(...parseMixedShortAnswer(lines));
  }

  return questions;
};

export function parseImportedQuizContent(content: string, type: string) {
  const text = String(content || '').trim();
  if (!text) return [];

  if (type === 'Mixed Type') {
    return parseMixedType(text);
  }

  const lines = text.split('\n').filter((line) => line.trim());

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

export async function importQuestionsFromFile(file: QuizImportFile, type: string) {
  const text = await extractTextFromQuizFile(file);
  if (!text.trim()) {
    return { text, questions: [] as any[] };
  }

  const mismatchError = getQuizTypeMismatchError(text, type, 'uploaded');
  if (mismatchError) {
    throw new Error(mismatchError);
  }

  const questions = parseImportedQuizContent(text, type);
  return { text, questions };
}
