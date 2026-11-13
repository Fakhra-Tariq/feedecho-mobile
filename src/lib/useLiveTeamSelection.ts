import { useEffect, useMemo, useRef, useState } from 'react';
import { get, onValue, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';
import { getTeamSelection } from '@/lib/hostSpaceRaces';
import { isSubmittedLockNode } from '@/lib/spaceRaceTeams';

export function nodesFromSnapshot(raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, any> = {};
  Object.entries(raw as Record<string, any>).forEach(([key, node]) => {
    if (!node || typeof node !== 'object') return;
    const mapKey = key.startsWith('question_') ? key : `question_${key}`;
    out[mapKey] = node;
  });
  return out;
}

function mergeQuestionNode(prev: Record<string, any>, key: string, incoming: any) {
  if (!incoming || typeof incoming !== 'object') return prev;
  const existing = prev[key];
  if (isSubmittedLockNode(existing) && !isSubmittedLockNode(incoming)) return prev;
  return { ...prev, [key]: incoming };
}

/**
 * Live team selection/lock for Space Race.
 * Team-level onValue is the source of truth (same tree Web reads).
 * Per-question listeners re-attach when the current question keys change and
 * only upsert — they never delete a node the team listener already delivered.
 */
export function useLiveTeamSelectionMap(
  raceId: string,
  teamId: string | number | null | undefined,
  questionKeys: string[]
) {
  const [map, setMap] = useState<Record<string, any>>({});
  const keysKey = questionKeys.join('|');
  const canonicalId = questionKeys[0] || '';
  const path =
    raceId && teamId != null && String(teamId) !== ''
      ? `space_race_team_selection/${raceId}/team_${teamId}`
      : null;
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) {
      setMap({});
      return undefined;
    }

    const teamRef = dbRef(db, path);
    const unsub = onValue(
      teamRef,
      (snap) => {
        setMap(snap.exists() ? nodesFromSnapshot(snap.val()) : {});
      },
      (err) => {
        console.warn('Team selection listener error:', err);
      }
    );

    get(teamRef)
      .then((snap) => {
        if (pathRef.current !== path) return;
        setMap(snap.exists() ? nodesFromSnapshot(snap.val()) : {});
      })
      .catch(() => undefined);

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [path]);

  useEffect(() => {
    if (!path || !keysKey) return undefined;
    const ids = keysKey.split('|').filter(Boolean);
    const stops = ids.map((id) => {
      const questionRef = dbRef(db, `${path}/question_${id}`);
      const unsub = onValue(
        questionRef,
        (snap) => {
          if (!snap.exists()) return;
          setMap((prev) => mergeQuestionNode(prev, `question_${id}`, snap.val()));
        },
        (err) => {
          console.warn('Current question lock listener error:', err);
        }
      );
      return unsub;
    });
    return () => {
      stops.forEach((stop) => {
        try {
          stop();
        } catch {
          // ignore
        }
      });
    };
  }, [path, keysKey]);

  useEffect(() => {
    if (!path || !raceId || teamId == null || !canonicalId) return undefined;
    let cancelled = false;

    getTeamSelection(raceId, teamId, canonicalId)
      .then((response) => {
        const raw = response as any;
        const data =
          raw?.data && typeof raw.data === 'object' && ('selectedOption' in raw.data || 'submitted' in raw.data)
            ? raw.data
            : raw?.data?.data && typeof raw.data.data === 'object'
              ? raw.data.data
              : raw?.selectedOption != null || raw?.submitted != null
                ? raw
                : raw?.data;
        if (cancelled || !data || typeof data !== 'object') return;
        setMap((prev) => mergeQuestionNode(prev, `question_${canonicalId}`, data));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [path, raceId, teamId, canonicalId]);

  return useMemo(() => map, [map]);
}
