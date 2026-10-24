import { useEffect, useMemo, useRef, useState } from 'react';
import { equalTo, off, onValue, orderByChild, query, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';

/** Stable empty list — avoids new array references on every render when using useRtdbList */
export const RTDB_EMPTY_LIST: any[] = Object.freeze([]) as any;

const snapshotsEqual = (prev: unknown, next: unknown) => {
  if (prev === next) return true;
  if (prev == null || next == null) return false;
  if (typeof prev !== 'object' || typeof next !== 'object') return false;
  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
};

export function useRtdbValue(
  path: string | null | undefined,
  {
    enabled = true,
    orderBy,
    equalToValue,
  }: { enabled?: boolean; orderBy?: string; equalToValue?: string | number | null } = {}
) {
  const [value, setValue] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      setValue(null);
      return undefined;
    }

    let cancelled = false;
    setValue(null);
    setLoading(true);
    setError(null);

    const baseRef = dbRef(db, path);
    const r =
      orderBy != null && equalToValue != null && equalToValue !== ''
        ? query(baseRef, orderByChild(orderBy), equalTo(equalToValue))
        : baseRef;

    const unsub = onValue(
      r,
      (snap) => {
        if (cancelled) return;
        const next = snap.exists() ? snap.val() : null;
        setValue((prev: unknown) => (snapshotsEqual(prev, next) ? prev : next));
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      try {
        unsub();
      } catch {
        off(r);
      }
    };
  }, [enabled, path, orderBy, equalToValue]);

  return { value, loading, error };
}

export function useRtdbList(
  path: string | null | undefined,
  {
    enabled = true,
    sort,
    filter,
    map,
    empty = RTDB_EMPTY_LIST,
    orderBy,
    equalToValue,
  }: {
    enabled?: boolean;
    sort?: (a: any, b: any) => number;
    filter?: (item: any) => boolean;
    map?: (item: any) => any;
    empty?: any[];
    orderBy?: string;
    equalToValue?: string | number | null;
  } = {}
) {
  const { value, loading, error } = useRtdbValue(path, { enabled, orderBy, equalToValue });

  const filterRef = useRef(filter);
  const sortRef = useRef(sort);
  const mapRef = useRef(map);
  filterRef.current = filter;
  sortRef.current = sort;
  mapRef.current = map;

  const list = useMemo(() => {
    if (!value) return empty;
    const entries = typeof value === 'object' ? Object.entries(value) : [];
    let items = entries.map(([id, v]) => ({ ...(v as object), id }));
    if (typeof filterRef.current === 'function') items = items.filter(filterRef.current);
    if (typeof sortRef.current === 'function') items = items.slice().sort(sortRef.current);
    if (typeof mapRef.current === 'function') items = items.map(mapRef.current);
    return items;
  }, [value, empty]);

  return { list, loading, error };
}
