import { useEffect, useMemo, useRef, useState } from 'react';
import { equalTo, off, onValue, orderByChild, query, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';

/** Stable empty list — avoids new array references on every render when using useRtdbList */
export const RTDB_EMPTY_LIST: any[] = Object.freeze([]) as any;

/** Shallow copy so React always gets a new root when RTDB reuses/mutates snap.val(). */
function cloneRtdbVal(val: unknown) {
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.slice();
  return { ...(val as Record<string, unknown>) };
}

export function useRtdbValue(
  path: string | null | undefined,
  {
    enabled = true,
    orderBy,
    equalToValue,
    resyncKey = 0,
  }: {
    enabled?: boolean;
    orderBy?: string;
    equalToValue?: string | number | null;
    /** Bump to detach/reattach after background or account change. */
    resyncKey?: number | string;
  } = {}
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
        const next = cloneRtdbVal(snap.exists() ? snap.val() : null);
        setValue(next);
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
      if (typeof unsub === 'function') {
        unsub();
        return;
      }
      off(r);
    };
  }, [enabled, path, orderBy, equalToValue, resyncKey]);

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
    resyncKey = 0,
    filterKey = 0,
  }: {
    enabled?: boolean;
    sort?: (a: any, b: any) => number;
    filter?: (item: any) => boolean;
    map?: (item: any) => any;
    empty?: any[];
    orderBy?: string;
    equalToValue?: string | number | null;
    resyncKey?: number | string;
    /** Bump when filter/sort identity should rebuild the list without a new snapshot. */
    filterKey?: string | number;
  } = {}
) {
  const { value, loading, error } = useRtdbValue(path, {
    enabled,
    orderBy,
    equalToValue,
    resyncKey,
  });

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
  }, [value, empty, filterKey]);

  return { list, loading, error };
}
