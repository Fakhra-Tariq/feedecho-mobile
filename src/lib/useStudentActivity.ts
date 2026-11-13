import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { loadLiveChatActivityItems } from '@/lib/liveChatActivity';
import {
  getStudentActivity,
  localQuizActivityItems,
  mergeActivityItems,
  studentQueryFromProfile,
  type ActivityItem,
} from '@/lib/studentsActivity';

const HIDDEN_KEY = 'audienceHiddenActivityIds';
const FETCH_LIMIT = 200;

type Snapshot = {
  items: ActivityItem[];
  hiddenIds: string[];
  loading: boolean;
  error: string;
};

let snapshot: Snapshot = {
  items: [],
  hiddenIds: [],
  loading: true,
  error: '',
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let lastQueryKey = '';

function emit() {
  listeners.forEach((fn) => fn());
}

function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

async function readHiddenIds() {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    if (!raw) return [] as string[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [] as string[];
  }
}

async function fetchActivity(queryKey: string, query: ReturnType<typeof studentQueryFromProfile>) {
  lastQueryKey = queryKey;
  const hiddenIds = await readHiddenIds();
  setSnapshot({ hiddenIds, loading: snapshot.items.length === 0, error: '' });
  try {
    const [server, local, liveChats] = await Promise.all([
      getStudentActivity({ ...query, limit: FETCH_LIMIT, details: 1 }),
      localQuizActivityItems(query),
      loadLiveChatActivityItems(query.uid),
    ]);
    if (lastQueryKey !== queryKey) return;
    setSnapshot({
      items: mergeActivityItems([...server, ...liveChats], local),
      hiddenIds,
      loading: false,
      error: '',
    });
  } catch {
    if (lastQueryKey !== queryKey) return;
    setSnapshot({
      items: [],
      hiddenIds,
      loading: false,
      error: 'Couldn’t load activity. Please try again.',
    });
  }
}

function loadActivity(query: ReturnType<typeof studentQueryFromProfile>, isGuest: boolean) {
  if (isGuest) {
    lastQueryKey = 'guest';
    setSnapshot({ items: [], hiddenIds: [], loading: false, error: '' });
    return;
  }
  if (!query.uid && !query.email && !query.name) {
    lastQueryKey = 'empty';
    setSnapshot({ items: [], hiddenIds: snapshot.hiddenIds, loading: false, error: '' });
    return;
  }
  const queryKey = JSON.stringify({
    uid: query.uid || '',
    email: query.email || '',
    name: query.name || '',
    aliases: query.aliases || '',
  });
  if (inflight && lastQueryKey === queryKey) return inflight;
  inflight = fetchActivity(queryKey, query).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function hideStudentActivity(id: string) {
  const next = snapshot.hiddenIds.includes(id)
    ? snapshot.hiddenIds
    : [...snapshot.hiddenIds, id];
  setSnapshot({ hiddenIds: next });
  try {
    await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Couldn’t remove this activity. Please try again.');
  }
}

/**
 * Shared student activity (Web GET /students/activity, limit 200 + details).
 * Home slices to 5; Progress shows the full visible list. Hidden ids are
 * device-local, matching Web Progress (in-memory hide, persisted on mobile).
 */
export function useStudentActivity(limit = FETCH_LIMIT) {
  const { profile, user, loading: authLoading } = useAuth();
  const [, bump] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const onChange = () => {
      if (mounted.current) bump((n) => n + 1);
    };
    listeners.add(onChange);
    return () => {
      mounted.current = false;
      listeners.delete(onChange);
    };
  }, []);

  const isGuest = Boolean(profile?.guest);
  const query = studentQueryFromProfile(profile, user);

  const reload = useCallback(() => {
    if (authLoading) return;
    void loadActivity(query, isGuest);
  }, [authLoading, isGuest, query.uid, query.email, query.name, query.aliases]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const visible = snapshot.items
    .filter((item) => !snapshot.hiddenIds.includes(item.id))
    .slice(0, limit);

  return {
    items: visible,
    loading: authLoading || snapshot.loading,
    error: snapshot.error,
    reload,
    hideActivity: hideStudentActivity,
  };
}
