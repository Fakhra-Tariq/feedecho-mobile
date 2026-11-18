import { useEffect, useMemo, useState } from 'react';

import {
  quizEditorHeaderMode,
  serializeQuizEditorSnapshot,
  type QuizEditorHeaderMode,
} from '@/lib/quizEditorSnapshot';

const DIRTY_DEBOUNCE_MS = 150;

/**
 * Compare current form values to the last saved snapshot (JSON stringify, not lodash).
 * Debounces dirty by ~150ms; reverting to the snapshot updates immediately.
 */
export function useQuizEditorDirty({
  title,
  questions,
  quizType,
  persistedId,
  snapshot,
}: {
  title: string;
  questions: any[];
  quizType: string;
  persistedId: string | null;
  snapshot: string | null;
}): { mode: QuizEditorHeaderMode; dirty: boolean; current: string } {
  const current = useMemo(
    () => serializeQuizEditorSnapshot({ title, questions, quizType }),
    [title, questions, quizType]
  );

  const [stableCurrent, setStableCurrent] = useState(current);

  useEffect(() => {
    if (snapshot != null && current === snapshot) {
      setStableCurrent(current);
      return undefined;
    }
    const timer = setTimeout(() => setStableCurrent(current), DIRTY_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [current, snapshot]);

  const compared = snapshot != null && current === snapshot ? current : stableCurrent;
  const dirty = Boolean(persistedId) && snapshot != null && compared !== snapshot;
  const mode = quizEditorHeaderMode(persistedId, snapshot, compared);

  return { mode, dirty, current };
}
