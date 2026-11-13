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

import { useAuth } from '@/context/AuthContext';
import { syncActiveActivitySource } from '@/lib/activeActivity';
import { subscribeTeacherQuizzes, type HostQuiz } from '@/lib/hostQuizzes';
import {
  createTeacherSession,
  deleteEndedSession,
  endTeacherSession,
  isSessionActive,
  listTeacherSessions,
  sortTeacherSessions,
  subscribeTeacherSessions,
  type HostSession,
} from '@/lib/hostSessions';
import { liveHostActivityLabel, pickLiveHostActivity } from '@/lib/liveHostActivity';
import { autoFinishExpiredQuiz } from '@/lib/quizAutoFinish';
import { isQuizExpired } from '@/lib/quizExpiry';
import { useRtdbList } from '@/lib/useRtdb';

type HostSessionContextValue = {
  sessions: HostSession[];
  activeSession: HostSession | null;
  quizzes: HostQuiz[];
  liveChats: ReturnType<typeof useRtdbList>['list'];
  liveRaces: ReturnType<typeof useRtdbList>['list'];
  liveTickets: ReturnType<typeof useRtdbList>['list'];
  /** Derived from live chat/quiz/race/ticket status, not sessions.currentActivity. */
  sessionActivityLabel: string;
  loading: boolean;
  createSession: (sessionName: string) => Promise<HostSession>;
  endSession: (session: HostSession) => Promise<void>;
  deleteSession: (session: HostSession) => Promise<void>;
};

const HostSessionContext = createContext<HostSessionContextValue | null>(null);

export function HostSessionProvider({ children }: PropsWithChildren) {
  const { profile, isHost } = useAuth();
  const teacherId = profile?.uid || '';
  const [sessions, setSessions] = useState<HostSession[]>([]);
  const [quizzes, setQuizzes] = useState<HostQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(0);
  const quizzesRef = useRef<HostQuiz[]>([]);
  quizzesRef.current = quizzes;
  /** API end/delete land before RTDB; skip stale snapshots until RTDB matches. */
  const pendingRef = useRef<{ ends: Set<string>; deletes: Set<string> }>({
    ends: new Set(),
    deletes: new Set(),
  });

  useEffect(() => {
    if (!isHost || !teacherId) {
      setSessions([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    let cancelled = false;
    let sawRtdbRows = false;

    const applyRows = (rows: HostSession[]) => {
      if (cancelled) return;
      const { ends, deletes } = pendingRef.current;
      deletes.forEach((id) => {
        if (!rows.some((s) => s.id === id)) deletes.delete(id);
      });
      ends.forEach((id) => {
        const row = rows.find((s) => s.id === id);
        if (!row || !isSessionActive(row)) ends.delete(id);
      });
      const next = rows
        .filter((s) => !deletes.has(s.id))
        .map((s) =>
          ends.has(s.id) && isSessionActive(s)
            ? { ...s, status: 'ended', endedAt: s.endedAt || new Date().toISOString() }
            : s
        );
      setSessions(sortTeacherSessions(next));
      setLoading(false);
    };

    const loadApiFallback = () => {
      listTeacherSessions(teacherId)
        .then((rows) => {
          if (cancelled || sawRtdbRows) return;
          applyRows(rows);
        })
        .catch(() => {
          if (!cancelled && !sawRtdbRows) applyRows([]);
        });
    };

    const unsubscribe = subscribeTeacherSessions(
      teacherId,
      (rows) => {
        if (rows.length > 0) {
          sawRtdbRows = true;
          applyRows(rows);
          return;
        }
        // Empty RTDB → same API Web Sessions page uses.
        loadApiFallback();
      },
      () => loadApiFallback()
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isHost, teacherId]);

  useEffect(() => {
    if (!isHost || !teacherId) {
      setQuizzes([]);
      return undefined;
    }
    const unsubscribe = subscribeTeacherQuizzes(teacherId, (rows) => {
      setQuizzes(rows);
      rows.forEach((quiz) => {
        if (isQuizExpired(quiz)) {
          void autoFinishExpiredQuiz(quiz);
        }
      });
    });
    return unsubscribe;
  }, [isHost, teacherId]);

  const listenLive = Boolean(isHost && teacherId);
  const { list: liveChats } = useRtdbList(listenLive ? 'chat_sessions' : null, {
    enabled: listenLive,
    filter: (chat) => String(chat?.createdBy || '') === teacherId,
  });
  const { list: liveRaces } = useRtdbList(listenLive ? 'spaceRaces' : null, {
    enabled: listenLive,
    filter: (race) => String(race?.createdBy || '') === teacherId,
  });
  const { list: liveTickets } = useRtdbList(listenLive ? 'exit_tickets' : null, {
    enabled: listenLive,
    filter: (ticket) => String(ticket?.createdBy || '') === teacherId,
  });

  useEffect(() => {
    if (!isHost) return undefined;
    const timer = setInterval(() => {
      setNowTick(Date.now());
      quizzesRef.current.forEach((quiz) => {
        if (isQuizExpired(quiz)) void autoFinishExpiredQuiz(quiz);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isHost]);

  const activeSession = useMemo(
    () => sessions.find((session) => isSessionActive(session)) || null,
    [sessions]
  );

  const sessionActivityLabel = useMemo(
    () =>
      liveHostActivityLabel(
        pickLiveHostActivity({
          chats: liveChats,
          quizzes,
          races: liveRaces,
          tickets: liveTickets,
          now: nowTick || Date.now(),
        })
      ),
    [liveChats, quizzes, liveRaces, liveTickets, nowTick]
  );

  const createSession = useCallback(
    async (sessionName: string) => {
      if (!teacherId) throw new Error('Host ID not found');
      if (activeSession) {
        throw new Error(
          'Only one session can be active at a time. End your current session to create a new one.'
        );
      }
      const created = await createTeacherSession(sessionName, teacherId);
      setSessions((prev) => sortTeacherSessions([created, ...prev.filter((s) => s.id !== created.id)]));
      return created;
    },
    [teacherId, activeSession]
  );

  const endSession = useCallback(
    async (session: HostSession) => {
      if (!teacherId) throw new Error('Host ID not found');
      await endTeacherSession(session, teacherId);
      pendingRef.current.ends.add(session.id);
      setSessions((prev) =>
        sortTeacherSessions(
          prev.map((s) =>
            s.id === session.id
              ? { ...s, status: 'ended', endedAt: new Date().toISOString() }
              : s
          )
        )
      );
    },
    [teacherId]
  );

  const deleteSession = useCallback(
    async (session: HostSession) => {
      if (!teacherId) throw new Error('Host ID not found');
      await deleteEndedSession(session, teacherId);
      pendingRef.current.deletes.add(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    },
    [teacherId]
  );

  useEffect(() => {
    syncActiveActivitySource(activeSession?.currentActivity ?? null, quizzes);
  }, [activeSession?.currentActivity, quizzes]);

  const value = useMemo(
    () => ({
      sessions,
      activeSession,
      quizzes,
      liveChats,
      liveRaces,
      liveTickets,
      sessionActivityLabel,
      loading,
      createSession,
      endSession,
      deleteSession,
    }),
    [
      sessions,
      activeSession,
      quizzes,
      liveChats,
      liveRaces,
      liveTickets,
      sessionActivityLabel,
      loading,
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

/** Same live pill label on every host screen; listeners live in HostSessionProvider. */
export function useSessionActivityLabel() {
  return useHostSessions().sessionActivityLabel;
}
