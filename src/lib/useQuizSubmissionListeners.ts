import { useEffect, useMemo, useState } from 'react';
import { off, onValue, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';

/**
 * Real-time listeners for quiz_submissions/{quizId} and optionally quiz_participants/{quizId}.
 * Same paths and behavior as Web useQuizSubmissionListeners.
 */
export function useQuizSubmissionListeners(
  quizIds: string[],
  { listenParticipants = false }: { listenParticipants?: boolean } = {}
) {
  const [submissionsByQuizId, setSubmissionsByQuizId] = useState<Record<string, any>>({});
  const [participantsByQuizId, setParticipantsByQuizId] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [readyForKey, setReadyForKey] = useState('');

  const stableIds = useMemo(() => {
    const ids = [...new Set((quizIds || []).filter(Boolean))];
    ids.sort();
    return ids;
  }, [quizIds]);

  const idsKey = stableIds.join(',');
  const ready = !idsKey || readyForKey === idsKey;

  useEffect(() => {
    if (!idsKey) {
      setSubmissionsByQuizId({});
      setParticipantsByQuizId({});
      setLoading(false);
      setReadyForKey('');
      return undefined;
    }

    setLoading(true);
    const subsAcc: Record<string, any> = {};
    const partsAcc: Record<string, any> = {};
    const unsubs: Array<() => void> = [];
    const received = new Set<string>();
    const expected = stableIds.length * (listenParticipants ? 2 : 1);
    const markReady = (key: string) => {
      if (received.has(key)) return;
      received.add(key);
      if (received.size >= expected) {
        setLoading(false);
        setReadyForKey(idsKey);
      }
    };

    stableIds.forEach((quizId) => {
      const subRef = dbRef(db, `quiz_submissions/${quizId}`);
      const unsubSub = onValue(
        subRef,
        (snap) => {
          subsAcc[quizId] = snap.exists() ? snap.val() || {} : {};
          setSubmissionsByQuizId({ ...subsAcc });
          markReady(`sub:${quizId}`);
        },
        () => {
          subsAcc[quizId] = {};
          setSubmissionsByQuizId({ ...subsAcc });
          markReady(`sub:${quizId}`);
        }
      );
      unsubs.push(() => {
        try {
          unsubSub();
        } catch {
          off(subRef);
        }
      });

      if (listenParticipants) {
        const partRef = dbRef(db, `quiz_participants/${quizId}`);
        const unsubPart = onValue(
          partRef,
          (snap) => {
            partsAcc[quizId] = snap.exists() ? snap.val() || {} : {};
            setParticipantsByQuizId({ ...partsAcc });
            markReady(`part:${quizId}`);
          },
          () => {
            partsAcc[quizId] = {};
            setParticipantsByQuizId({ ...partsAcc });
            markReady(`part:${quizId}`);
          }
        );
        unsubs.push(() => {
          try {
            unsubPart();
          } catch {
            off(partRef);
          }
        });
      }
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [idsKey, listenParticipants, stableIds]);

  return { submissionsByQuizId, participantsByQuizId, loading, ready };
}
