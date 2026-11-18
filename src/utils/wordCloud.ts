/**
 * Mirrors Web/client/src/utils/exitTicketWordCloud.js
 * (stop words, tokenization, casing merge, option labels, top-60 cap).
 * Keep in sync with the website helper; do not change those rules here.
 */

export const EXIT_TICKET_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'and',
  'or',
  'of',
  'to',
  'in',
  'it',
  'this',
  'that',
  'was',
  'be',
  'i',
  'we',
  'you',
  'bit',
  'etc',
]);

const WORD_TOKEN_RE = /[\p{L}\p{N}]+/gu;

export type WordCloudItem = {
  key: string;
  label: string;
  count: number;
};

const optionText = (option: unknown): string => {
  if (option == null) return '';
  if (typeof option === 'string') return option.trim();
  const obj = option as { text?: string; label?: string; id?: string };
  return String(obj.text || obj.label || obj.id || '').trim();
};

export function normalizeExitTicketQuestionType(raw: unknown): string {
  const t = String(raw || 'short_text')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'shorttext') return 'short_text';
  if (t === 'multiplechoice' || t === 'mcq') return 'multiple_choice';
  if (t === 'truefalse' || t === 'true/false') return 'true_false';
  return t || 'short_text';
}

export function isChoiceType(type: unknown): boolean {
  const t = normalizeExitTicketQuestionType(type);
  return t === 'multiple_choice' || t === 'likert' || t === 'true_false';
}

export function typeLabel(type: unknown): string {
  switch (normalizeExitTicketQuestionType(type)) {
    case 'multiple_choice':
      return 'Multiple Choice';
    case 'likert':
      return 'Likert Scale';
    case 'true_false':
      return 'True / False';
    default:
      return 'Short Text';
  }
}

export function getExitTicketQuestionOptions(question: {
  type?: unknown;
  options?: unknown;
} | null | undefined): string[] {
  const type = normalizeExitTicketQuestionType(question?.type);
  if (type === 'true_false') return ['True', 'False'];
  if (type === 'likert') {
    const fromQuestion = Array.isArray(question?.options)
      ? question.options.map(optionText).filter(Boolean)
      : [];
    if (fromQuestion.length) return fromQuestion;
    return ['Strongly Agree', 'Agree', 'Neutral', 'Disagree', 'Strongly Disagree'];
  }
  if (type === 'multiple_choice') {
    return (Array.isArray(question?.options) ? question.options : [])
      .map(optionText)
      .filter(Boolean);
  }
  return [];
}

export function getResponseAnswerAt(response: { answers?: unknown } | null | undefined, index: number) {
  const answers = response?.answers;
  if (Array.isArray(answers)) {
    const byIndex = answers[index];
    if (byIndex && typeof byIndex === 'object' && 'answer' in byIndex) {
      return (byIndex as { answer: unknown }).answer;
    }
    const byQ = answers.find(
      (row) => Number((row as { questionIndex?: number })?.questionIndex) === Number(index)
    );
    if (byQ && typeof byQ === 'object' && 'answer' in byQ) {
      return (byQ as { answer: unknown }).answer;
    }
    return byIndex;
  }
  if (answers && typeof answers === 'object') {
    const rec = answers as Record<string, unknown>;
    const row = rec[index] ?? rec[String(index)];
    if (row && typeof row === 'object' && 'answer' in (row as object)) {
      return (row as { answer: unknown }).answer;
    }
    return row;
  }
  return null;
}

export function resolveExitTicketAnswerLabel(
  answer: unknown,
  question: { type?: unknown; options?: unknown } | null | undefined
): string {
  if (answer == null || answer === '') return '';
  const raw = typeof answer === 'object' ? optionText(answer) : String(answer).trim();
  if (!raw) return '';
  const options = getExitTicketQuestionOptions(question);
  if (!options.length) return raw;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && String(raw).trim() === String(asNum) && options[asNum]) {
    return options[asNum];
  }
  const matched = options.find((opt) => opt.toLowerCase() === raw.toLowerCase());
  return matched || raw;
}

export function collectAnswerTexts(
  responses: { answers?: unknown }[] | null | undefined,
  questionIndex: number,
  question: { type?: unknown; options?: unknown } | null | undefined
): string[] {
  return (responses || [])
    .map((row) => resolveExitTicketAnswerLabel(getResponseAnswerAt(row, questionIndex), question))
    .filter((text) => String(text).trim() !== '');
}

export function extractWordTokens(text: unknown): string[] {
  const raw = String(text || '');
  const tokens = raw.match(WORD_TOKEN_RE);
  return tokens || [];
}

const pickDisplayForm = (forms: Map<string, number>) => {
  let best = '';
  let bestCount = -1;
  forms.forEach((n, form) => {
    if (n > bestCount || (n === bestCount && form.length > best.length)) {
      best = form;
      bestCount = n;
    }
  });
  return best;
};

type Agg = { key: string; count: number; forms: Map<string, number> };

const addItem = (map: Map<string, Agg>, key: string, display: string) => {
  let entry = map.get(key);
  if (!entry) {
    entry = { key, count: 0, forms: new Map() };
    map.set(key, entry);
  }
  entry.count += 1;
  entry.forms.set(display, (entry.forms.get(display) || 0) + 1);
};

export function buildExitTicketWordCloudItems({
  texts,
  mode = 'words',
}: {
  texts?: unknown[];
  mode?: 'words' | 'phrases';
} = {}): WordCloudItem[] {
  const map = new Map<string, Agg>();
  (texts || []).forEach((text) => {
    if (mode === 'words') {
      extractWordTokens(text).forEach((token) => {
        if (token.length <= 1) return;
        const key = token.toLowerCase();
        if (EXIT_TICKET_STOP_WORDS.has(key)) return;
        addItem(map, key, token);
      });
      return;
    }
    const collapsed = String(text || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!collapsed) return;
    addItem(map, collapsed.toLowerCase(), collapsed);
  });

  return Array.from(map.values())
    .map((entry) => ({
      key: entry.key,
      label: pickDisplayForm(entry.forms),
      count: entry.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const WORD_CLOUD_MAX_ITEMS = 60;

export function capWordCloudItems(items: WordCloudItem[] | null | undefined, max = WORD_CLOUD_MAX_ITEMS) {
  const list = Array.isArray(items) ? items : [];
  if (list.length <= max) return { items: list, extra: 0 };
  return { items: list.slice(0, max), extra: list.length - max };
}

/**
 * Schedule work after the current frame. Prefer requestIdleCallback when
 * the runtime provides it; otherwise setTimeout(0).
 */
export function scheduleIdle(callback: () => void, timeout = 100): () => void {
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(() => callback(), { timeout });
    return () => {
      if (typeof g.cancelIdleCallback === 'function') g.cancelIdleCallback(id);
    };
  }
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

export function buildCloudItemsForQuestion(
  responses: { answers?: unknown }[] | null | undefined,
  questionIndex: number,
  question: { type?: unknown; options?: unknown } | null | undefined,
  shortTextMode: 'words' | 'phrases'
) {
  const texts = collectAnswerTexts(responses, questionIndex, question);
  const choice = isChoiceType(question?.type);
  const mode = choice ? 'phrases' : shortTextMode === 'phrases' ? 'phrases' : 'words';
  const built = buildExitTicketWordCloudItems({ texts, mode });
  return capWordCloudItems(built, WORD_CLOUD_MAX_ITEMS);
}
