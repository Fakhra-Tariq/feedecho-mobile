import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { auth } from '../../firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { syncActiveActivitySource, syncLiveHostActivity } from '@/lib/activeActivity';
import { listAnonymousChats } from '@/lib/anonymousChat';
import { listExitTickets } from '@/lib/hostExitTickets';
import {
  registerHostDataSync,
  unregisterHostDataSync,
} from '@/lib/hostDataSync';
import { sameHostList, sameHostRow } from '@/lib/hostListSignature';
import {
  listTeacherQuizzes,
  mergeTeacherQuizLists,
  subscribeSavedQuizCache,
  type HostQuiz,
} from '@/lib/hostQuizzes';
import {
  attachFirebaseConnectedPing,
  attachHostCreatedByPings,
  attachTeacherActiveSessionPing,
  HOST_PING_DEBOUNCE_MS,
  HOST_PING_MIN_INTERVAL_MS,
  HOST_SAFETY_POLL_MS,
} from '@/lib/hostRealtimePings';
import { listSpaceRaces } from '@/lib/hostSpaceRaces';
import {
  createTeacherSession,
  deleteEndedSession,
  fetchActiveTeacherSession,
  isSessionActive,
  listTeacherSessions,
  sortTeacherSessions,
  subscribeSessionRecord,
  type HostSession,
} from '@/lib/hostSessions';
import { endStandaloneSession } from '@/lib/sessionEnd';
import { pickLiveHostActivity, type LiveHostActivity } from '@/lib/liveHostActivity';
import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';
import { autoFinishExpiredQuiz } from '@/lib/quizAutoFinish';
import { isQuizExpired } from '@/lib/quizExpiry';

type HostList = any[];

export type HostSyncNode = 'quizzes' | 'tickets' | 'races' | 'chats' | 'sessions';

const ALL_NODES: HostSyncNode[] = ['quizzes', 'tickets', 'races', 'chats', 'sessions'];

type HostSessionContextValue = {
  sessions: HostSession[];
  activeSession: HostSession | null;
  quizzes: HostQuiz[];
  quizzesLoading: boolean;
  liveChats: HostList;
  liveRaces: HostList;
  liveTickets: HostList;
  liveTicketsLoading: boolean;
  liveTicketsError: Error | null;
  liveChatsLoading: boolean;
  liveRacesLoading: boolean;
  liveRacesError: Error | null;
  /** Same as Web SessionLaunchBanner: sessions.currentActivity from GET /sessions/active. */
  sessionActivityLabel: string;
  liveActivity: LiveHostActivity | null;
  loading: boolean;
  /** Bumped after each successful REST workspace refetch (Reports / focus). */
  dataEpoch: number;
  refetchHostData: () => Promise<void>;
  createSession: (sessionName: string) => Promise<HostSession>;
  endSession: (session: HostSession) => Promise<void>;
  deleteSession: (session: HostSession) => Promise<void>;
};

const HostSessionContext = createContext<HostSessionContextValue | null>(null);

function pingPathToNodes(path: string): HostSyncNode[] {
  const p = String(path || '');
  if (p.startsWith('quizzes')) return ['quizzes'];
  if (p.startsWith('exit_tickets')) return ['tickets'];
  if (p.startsWith('spaceRaces')) return ['races'];
  if (p.startsWith('chat_sessions')) return ['chats'];
  if (p.includes('activeSession') || p.startsWith('sessions')) return ['sessions'];
  return ALL_NODES;
}

function liveActivitySame(a: LiveHostActivity | null, b: LiveHostActivity | null) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.type === b.type && a.id === b.id && a.startedAt === b.startedAt;
}

export function HostSessionProvider({ children }: PropsWithChildren) {
  const { profile, user, isHost } = useAuth();
  const teacherId = String(auth.currentUser?.uid || user?.uid || profile?.uid || '').trim();

  const [sessions, setSessions] = useState<HostSession[]>([]);
  const [activeSession, setActiveSession] = useState<HostSession | null>(null);
  const [quizzes, setQuizzes] = useState<HostQuiz[]>([]);
  const [liveChats, setLiveChats] = useState<HostList>([]);
  const [liveRaces, setLiveRaces] = useState<HostList>([]);
  const [liveTickets, setLiveTickets] = useState<HostList>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [liveChatsLoading, setLiveChatsLoading] = useState(true);
  const [liveRacesLoading, setLiveRacesLoading] = useState(true);
  const [liveTicketsLoading, setLiveTicketsLoading] = useState(true);
  const [liveRacesError, setLiveRacesError] = useState<Error | null>(null);
  const [liveTicketsError, setLiveTicketsError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveActivity, setLiveActivity] = useState<LiveHostActivity | null>(null);
  const [dataEpoch, setDataEpoch] = useState(0);

  const quizzesRef = useRef<HostQuiz[]>([]);
  quizzesRef.current = quizzes;
  const ticketsRef = useRef<HostList>([]);
  ticketsRef.current = liveTickets;
  const racesRef = useRef<HostList>([]);
  racesRef.current = liveRaces;
  const chatsRef = useRef<HostList>([]);
  chatsRef.current = liveChats;
  const sessionsRef = useRef<HostSession[]>([]);
  sessionsRef.current = sessions;
  const activeSessionRef = useRef<HostSession | null>(null);
  activeSessionRef.current = activeSession;
  const liveActivityRef = useRef<LiveHostActivity | null>(null);
  liveActivityRef.current = liveActivity;
  const teacherIdRef = useRef(teacherId);
  teacherIdRef.current = teacherId;
  const hasLoadedRef = useRef(false);
  const foregroundRef = useRef(AppState.currentState === 'active');
  const seqByNodeRef = useRef<Record<HostSyncNode, number>>({
    quizzes: 0,
    tickets: 0,
    races: 0,
    chats: 0,
    sessions: 0,
  });
  const inflightRef = useRef<Record<HostSyncNode, boolean>>({
    quizzes: false,
    tickets: false,
    races: false,
    chats: false,
    sessions: false,
  });
  const dirtyRef = useRef<Record<HostSyncNode, boolean>>({
    quizzes: false,
    tickets: false,
    races: false,
    chats: false,
    sessions: false,
  });
  const pendingNodesRef = useRef<Set<HostSyncNode | 'all'>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minIntervalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBulkRef = useRef(0);
  const applyNodesRef = useRef<(nodes: HostSyncNode[], reason: string) => Promise<void>>(
    async () => undefined
  );

  const bumpEpochIf = (changed: boolean) => {
    if (changed) setDataEpoch((n) => n + 1);
  };

  const resetWorkspace = useCallback(() => {
    ALL_NODES.forEach((node) => {
      seqByNodeRef.current[node] += 1;
      inflightRef.current[node] = false;
      dirtyRef.current[node] = false;
    });
    pendingNodesRef.current.clear();
    hasLoadedRef.current = false;
    setSessions([]);
    setActiveSession(null);
    setQuizzes([]);
    setLiveChats([]);
    setLiveRaces([]);
    setLiveTickets([]);
    setLiveActivity(null);
    setQuizzesLoading(false);
    setLiveChatsLoading(false);
    setLiveRacesLoading(false);
    setLiveTicketsLoading(false);
    setLiveRacesError(null);
    setLiveTicketsError(null);
    setLoading(false);
  }, []);

  const fetchNode = useCallback(async (node: HostSyncNode, reason: string, uid: string, first: boolean) => {
    if (inflightRef.current[node]) {
      dirtyRef.current[node] = true;
      return;
    }
    inflightRef.current[node] = true;
    const seq = ++seqByNodeRef.current[node];
    let changed = false;

    try {
      if (node === 'quizzes') {
        try {
          const rows = mergeTeacherQuizLists(await listTeacherQuizzes(uid));
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          if (!sameHostList(quizzesRef.current, rows)) {
            setQuizzes(rows);
            changed = true;
          }
          setQuizzesLoading(false);
        } catch (error) {
          if (seq !== seqByNodeRef.current[node]) return;
          console.warn('[host refetch] GET /quizzes', error);
          if (first) setQuizzesLoading(true);
        }
      } else if (node === 'tickets') {
        try {
          const rows = await listExitTickets();
          const next = Array.isArray(rows) ? rows : [];
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          if (!sameHostList(ticketsRef.current, next)) {
            setLiveTickets(next);
            changed = true;
          }
          setLiveTicketsError(null);
          setLiveTicketsLoading(false);
        } catch (error) {
          if (seq !== seqByNodeRef.current[node]) return;
          const err = error instanceof Error ? error : new Error(String(error));
          console.warn('[host refetch] GET /exit-tickets', err);
          setLiveTicketsError(err);
          if (first) setLiveTicketsLoading(true);
        }
      } else if (node === 'races') {
        try {
          const rows = await listSpaceRaces();
          const next = Array.isArray(rows) ? rows : [];
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          if (!sameHostList(racesRef.current, next)) {
            setLiveRaces(next);
            changed = true;
          }
          setLiveRacesError(null);
          setLiveRacesLoading(false);
        } catch (error) {
          if (seq !== seqByNodeRef.current[node]) return;
          const err = error instanceof Error ? error : new Error(String(error));
          console.warn('[host refetch] GET /space-races', err);
          setLiveRacesError(err);
          if (first) setLiveRacesLoading(true);
        }
      } else if (node === 'chats') {
        try {
          const rows = await listAnonymousChats();
          const next = Array.isArray(rows) ? rows : [];
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          if (!sameHostList(chatsRef.current, next)) {
            setLiveChats(next);
            changed = true;
          }
          setLiveChatsLoading(false);
        } catch (error) {
          if (seq !== seqByNodeRef.current[node]) return;
          console.warn('[host refetch] GET /anonymous-chats', error);
          if (first) setLiveChatsLoading(true);
        }
      } else {
        let nextActive: HostSession | null = null;
        let activeOk = false;
        try {
          nextActive = await fetchActiveTeacherSession(uid);
          activeOk = true;
        } catch (error) {
          console.warn('[host refetch] GET /sessions/active', error);
        }
        try {
          const listed = await listTeacherSessions(uid);
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          let rows = sortTeacherSessions(listed);
          if (activeOk && nextActive?.id) {
            rows = sortTeacherSessions([nextActive, ...rows.filter((s) => s.id !== nextActive.id)]);
          } else if (activeOk) {
            rows = sortTeacherSessions(
              rows.map((s) =>
                isSessionActive(s)
                  ? { ...s, status: 'ended', endedAt: s.endedAt || new Date().toISOString() }
                  : s
              )
            );
          }
          if (!sameHostList(sessionsRef.current, rows)) {
            setSessions(rows);
            changed = true;
          }
        } catch (error) {
          if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
          console.warn('[host refetch] GET /sessions/teacher', error);
          if (activeOk && nextActive?.id) {
            const rows = sortTeacherSessions([
              nextActive,
              ...sessionsRef.current.filter((s) => s.id !== nextActive.id),
            ]);
            if (!sameHostList(sessionsRef.current, rows)) {
              setSessions(rows);
              changed = true;
            }
          }
        }
        if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
        if (activeOk && !sameHostRow(activeSessionRef.current, nextActive)) {
          setActiveSession(nextActive);
          changed = true;
        }
      }
    } finally {
      inflightRef.current[node] = false;
      if (seq !== seqByNodeRef.current[node] || teacherIdRef.current !== uid) return;
      bumpEpochIf(changed);
      if (dirtyRef.current[node]) {
        dirtyRef.current[node] = false;
        void fetchNode(node, `${reason}:retry`, uid, false);
      }
    }
  }, []);

  const applyNodes = useCallback(
    async (nodes: HostSyncNode[], reason: string) => {
      const uid = teacherIdRef.current;
      if (!uid || nodes.length === 0) return;
      const first = !hasLoadedRef.current;
      if (first) {
        setLoading(true);
        if (nodes.includes('quizzes')) setQuizzesLoading(true);
        if (nodes.includes('chats')) setLiveChatsLoading(true);
        if (nodes.includes('races')) setLiveRacesLoading(true);
        if (nodes.includes('tickets')) setLiveTicketsLoading(true);
      }
      lastBulkRef.current = Date.now();
      await Promise.all(nodes.map((node) => fetchNode(node, reason, uid, first)));
      if (teacherIdRef.current !== uid) return;
      hasLoadedRef.current = true;
      setLoading(false);
    },
    [fetchNode]
  );

  applyNodesRef.current = applyNodes;

  const takePending = () => {
    const pending = pendingNodesRef.current;
    pendingNodesRef.current = new Set();
    if (pending.has('all') || pending.size === 0) return [...ALL_NODES];
    return Array.from(pending) as HostSyncNode[];
  };

  const queueNodes = (nodes: HostSyncNode[] | 'all') => {
    if (nodes === 'all') {
      pendingNodesRef.current = new Set(['all']);
      return;
    }
    if (pendingNodesRef.current.has('all')) return;
    nodes.forEach((n) => pendingNodesRef.current.add(n));
  };

  const flushPending = (reason: string) => {
    const nodes = takePending();
    void applyNodesRef.current(nodes, reason);
  };

  const schedulePingRefetch = useCallback((path: string) => {
    queueNodes(pingPathToNodes(path));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const delay = hasLoadedRef.current ? HOST_PING_DEBOUNCE_MS : 0;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const now = Date.now();
      const elapsed = now - lastBulkRef.current;
      if (hasLoadedRef.current && lastBulkRef.current && elapsed < HOST_PING_MIN_INTERVAL_MS) {
        const wait = HOST_PING_MIN_INTERVAL_MS - elapsed;
        if (minIntervalTimerRef.current) clearTimeout(minIntervalTimerRef.current);
        minIntervalTimerRef.current = setTimeout(() => {
          minIntervalTimerRef.current = null;
          flushPending('ping');
        }, wait);
        return;
      }
      flushPending('ping');
    }, delay);
  }, []);

  const refetchImmediate = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (minIntervalTimerRef.current) {
      clearTimeout(minIntervalTimerRef.current);
      minIntervalTimerRef.current = null;
    }
    queueNodes('all');
    await applyNodesRef.current(takePending(), 'immediate');
  }, []);

  useEffect(() => {
    registerHostDataSync({ refetchImmediate });
    return () => unregisterHostDataSync();
  }, [refetchImmediate]);

  useEffect(() => {
    if (!isHost || !teacherId) {
      resetWorkspace();
      return undefined;
    }

    hasLoadedRef.current = false;
    setQuizzesLoading(true);
    setLiveChatsLoading(true);
    setLiveRacesLoading(true);
    setLiveTicketsLoading(true);
    setLoading(true);

    queueNodes('all');
    void applyNodesRef.current(takePending(), 'mount');

    const detachPings = attachHostCreatedByPings(
      teacherId,
      (path) => schedulePingRefetch(path),
      (path, error) => {
        console.warn('[host ping] error', { path, uid: teacherId, error });
        schedulePingRefetch(path);
      }
    );
    const detachPointer = attachTeacherActiveSessionPing(
      teacherId,
      () => schedulePingRefetch('activeSession/byTeacher'),
      (error) => {
        console.warn('[host ping] error', {
          path: `activeSession/byTeacher/${teacherId}`,
          uid: teacherId,
          error,
        });
        schedulePingRefetch('activeSession/byTeacher');
      }
    );
    const detachConnected = attachFirebaseConnectedPing(
      () => {
        void refetchImmediate();
      },
      (error) => {
        console.warn('[host ping] error', { path: '.info/connected', error });
      }
    );

    const appState = AppState.addEventListener('change', (next: AppStateStatus) => {
      foregroundRef.current = next === 'active';
      if (next === 'active') void refetchImmediate();
    });
    const safety = setInterval(() => {
      if (!foregroundRef.current || AppState.currentState !== 'active') return;
      queueNodes('all');
      void applyNodesRef.current(takePending(), 'safety');
    }, HOST_SAFETY_POLL_MS);

    return () => {
      detachPings();
      detachPointer();
      detachConnected();
      appState.remove();
      clearInterval(safety);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (minIntervalTimerRef.current) clearTimeout(minIntervalTimerRef.current);
    };
  }, [isHost, teacherId, refetchImmediate, schedulePingRefetch, resetWorkspace]);

  useEffect(() => {
    const unsubCache = subscribeSavedQuizCache((cached) => {
      setQuizzes((prev) => {
        const next = mergeTeacherQuizLists(prev, cached);
        return sameHostList(prev, next) ? prev : next;
      });
    });
    return unsubCache;
  }, []);

  useEffect(() => {
    const sessionId = activeSession?.id;
    if (!isHost || !sessionId) return undefined;
    const unsub = subscribeSessionRecord(
      sessionId,
      (row) => {
        if (!row || !isSessionActive(row)) {
          void refetchImmediate();
          return;
        }
        setActiveSession((prev) => {
          if (!prev || prev.id !== row.id) return prev;
          const next = { ...prev, ...row, currentActivity: row.currentActivity ?? prev.currentActivity };
          return sameHostRow(prev, next) ? prev : next;
        });
        setSessions((prev) => {
          const next = sortTeacherSessions([row, ...prev.filter((s) => s.id !== row.id)]);
          return sameHostList(prev, next) ? prev : next;
        });
      },
      (error) => {
        console.warn('[host ping] error', { path: `sessions/${sessionId}`, error });
        void refetchImmediate();
      }
    );
    return () => unsub();
  }, [isHost, activeSession?.id, refetchImmediate]);

  const recomputeLiveActivity = useCallback(() => {
    const next = pickLiveHostActivity({
      chats: chatsRef.current,
      quizzes: quizzesRef.current,
      races: racesRef.current,
      tickets: ticketsRef.current,
      sessions: sessionsRef.current,
      now: Date.now(),
    });
    if (liveActivitySame(liveActivityRef.current, next)) return;
    liveActivityRef.current = next;
    setLiveActivity(next);
  }, []);

  useEffect(() => {
    recomputeLiveActivity();
  }, [liveChats, quizzes, liveRaces, liveTickets, sessions, recomputeLiveActivity]);

  useEffect(() => {
    if (!isHost) return undefined;
    const timer = setInterval(() => {
      quizzesRef.current.forEach((quiz) => {
        if (isQuizExpired(quiz)) void autoFinishExpiredQuiz(quiz);
      });
      recomputeLiveActivity();
    }, 1000);
    return () => clearInterval(timer);
  }, [isHost, recomputeLiveActivity]);

  const sessionActivityLabel = useMemo(() => {
    return (
      getSessionActivityLabel(activeSession?.currentActivity, quizzes) || 'No active activity'
    );
  }, [activeSession?.currentActivity, quizzes]);

  const createSession = useCallback(
    async (sessionName: string) => {
      if (!teacherId) throw new Error('Host ID not found');
      const live =
        (activeSession && isSessionActive(activeSession) ? activeSession : null) ||
        (await fetchActiveTeacherSession(teacherId).catch(() => null));
      if (live && isSessionActive(live)) {
        setActiveSession(live);
        setSessions((prev) => sortTeacherSessions([live, ...prev.filter((s) => s.id !== live.id)]));
        throw new Error(
          'Only one session can be active at a time. End your current session to create a new one.'
        );
      }
      const created = await createTeacherSession(sessionName, teacherId);
      setActiveSession(created);
      setSessions((prev) => sortTeacherSessions([created, ...prev.filter((s) => s.id !== created.id)]));
      void refetchImmediate();
      return created;
    },
    [teacherId, activeSession, refetchImmediate]
  );

  const endSession = useCallback(
    async (session: HostSession) => {
      if (!teacherId) throw new Error('Host ID not found');
      await endStandaloneSession(session, teacherId, {
        races: liveRaces,
        quizzes,
        tickets: liveTickets,
        chats: liveChats,
      });
      setActiveSession((current) => (current?.id === session.id ? null : current));
      setSessions((prev) =>
        sortTeacherSessions(
          prev.map((s) =>
            s.id === session.id
              ? { ...s, status: 'ended', endedAt: new Date().toISOString() }
              : s
          )
        )
      );
      void refetchImmediate();
    },
    [teacherId, liveRaces, quizzes, liveTickets, liveChats, refetchImmediate]
  );

  const deleteSession = useCallback(
    async (session: HostSession) => {
      if (!teacherId) throw new Error('Host ID not found');
      await deleteEndedSession(session, teacherId);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setActiveSession((current) => (current?.id === session.id ? null : current));
      void refetchImmediate();
    },
    [teacherId, refetchImmediate]
  );

  useEffect(() => {
    syncActiveActivitySource(activeSession?.currentActivity ?? null, quizzes);
  }, [activeSession?.currentActivity, quizzes]);

  useEffect(() => {
    syncLiveHostActivity(liveActivity);
  }, [liveActivity]);

  const value = useMemo(
    () => ({
      sessions,
      activeSession,
      quizzes,
      quizzesLoading,
      liveChats,
      liveRaces,
      liveTickets,
      liveTicketsLoading,
      liveTicketsError: liveTickets.length > 0 ? null : liveTicketsError,
      liveChatsLoading,
      liveRacesLoading,
      liveRacesError: liveRaces.length > 0 ? null : liveRacesError,
      sessionActivityLabel,
      liveActivity,
      loading,
      dataEpoch,
      refetchHostData: refetchImmediate,
      createSession,
      endSession,
      deleteSession,
    }),
    [
      sessions,
      activeSession,
      quizzes,
      quizzesLoading,
      liveChats,
      liveRaces,
      liveTickets,
      liveTicketsLoading,
      liveTicketsError,
      liveChatsLoading,
      liveRacesLoading,
      liveRacesError,
      sessionActivityLabel,
      liveActivity,
      loading,
      dataEpoch,
      refetchImmediate,
      createSession,
      endSession,
      deleteSession,
    ]
  );

  return <HostSessionContext.Provider value={value}>{children}</HostSessionContext.Provider>;
}

export function useHostSessions() {
  const value = useContext(HostSessionContext);
  if (!value) {
    throw new Error('useHostSessions must be used within a HostSessionProvider');
  }
  return value;
}

/** Session banner label on every host screen; source is GET /sessions/active currentActivity. */
export function useSessionActivityLabel() {
  return useHostSessions().sessionActivityLabel;
}
