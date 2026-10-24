import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { showAlert, showToast } from '@/components/feedback';
import { ConfirmModal } from '@/components/ConfirmModal';
import { KEYBOARD_SCROLL_PROPS, KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { SpaceRaceSettingsModal } from '@/components/SpaceRaceSettingsModal';
import { HeroHowItWorksLink, HeroStatTiles } from '@/components/HostHeroChrome';
import { HostFilterChips, HostSearchBar } from '@/components/HostListToolbar';
import { AppButton, EmptyState } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useHostSessions } from '@/context/HostSessionContext';
import {
  cleanErrorMessage,
  isActivityConflictMessage,
  showActivityBlockedAlert,
  showLaunchFailureAlert,
} from '@/lib/activeActivity';
import {
  deleteSpaceRace,
  endSpaceRace,
  getRaceParticipants,
  listSpaceRaces,
  updateSpaceRace,
  updateSpaceRaceStatus,
  type SpaceRace,
} from '@/lib/hostSpaceRaces';
import { buildTeamStandings, getRaceStatus } from '@/lib/spaceRaceTeams';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';
import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';
import { toParticipantCount } from '@/lib/toParticipantCount';
import { useRtdbList } from '@/lib/useRtdb';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
] as const;

const RACES_PAGE_SIZE = 5;

const HOW_IT_WORKS = [
  'Pick an existing quiz from your library to turn into a race',
  'Set team settings (auto-assign or audience choice)',
  'Launching requires an active session',
  'Teams compete live and can chat within their team.',
];

function formatRaceTime(race: SpaceRace) {
  if (race.timerMinutes) return `${race.timerMinutes} min`;
  const countdown = race.settings?.countdown;
  if (countdown) {
    if (countdown < 60) return `${countdown}s`;
    return `${countdown / 60} min`;
  }
  return 'No limit';
}

function formatMmSs(differenceMs: number) {
  if (differenceMs <= 0) return '00:00';
  const total = Math.floor(differenceMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Same remaining-time rules as Web HostSpaceRace `RaceTimer`. */
function computeRaceTimeLeft(race: SpaceRace) {
  try {
    if (race.startedAt && race.settings?.joinDuration) {
      const start = new Date(race.startedAt).getTime();
      const end = start + Number(race.settings.joinDuration) * 60 * 1000;
      return formatMmSs(end - Date.now());
    }
    if (race.endTime) {
      const end = new Date(race.endTime).getTime();
      if (Number.isNaN(end)) return '--:--';
      return formatMmSs(end - Date.now());
    }
    return race.timerMinutes ? `${race.timerMinutes}:00` : '--:--';
  } catch {
    return '--:--';
  }
}

function RaceTimer({ race }: { race: SpaceRace }) {
  const startedAt = race.startedAt;
  const joinDuration = race.settings?.joinDuration;
  const endTime = race.endTime;
  const timerMinutes = race.timerMinutes;
  const raceRef = useRef(race);
  raceRef.current = race;
  const [timeLeft, setTimeLeft] = useState(() => computeRaceTimeLeft(race));

  useEffect(() => {
    const tick = () => setTimeLeft(computeRaceTimeLeft(raceRef.current));
    tick();
    const interval = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [startedAt, joinDuration, endTime, timerMinutes]);

  return <Text style={styles.metaText}>{timeLeft}</Text>;
}

export default function HostSpaceRaceLibraryScreen() {
  const { profile } = useAuth();
  const { activeSession, quizzes } = useHostSessions();
  const insets = useSafeAreaInsets();
  const uid = profile?.uid || '';
  const isSessionActive = Boolean(activeSession?.sessionCode);
  const activityLabel = getSessionActivityLabel(activeSession?.currentActivity, quizzes);

  const { list: liveRaces, loading: liveLoading } = useRtdbList(uid ? 'spaceRaces' : null, {
    enabled: Boolean(uid),
    filter: (r) => String(r.createdBy || '') === uid,
    sort: (a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
  });

  const [races, setRaces] = useState<SpaceRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [search, setSearch] = useState('');
  const [visibleRaceCount, setVisibleRaceCount] = useState(RACES_PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<SpaceRace | null>(null);
  const [settingsRace, setSettingsRace] = useState<SpaceRace | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [miniBoards, setMiniBoards] = useState<Record<string, { teamId: number; score: number }[]>>(
    {}
  );
  const [launchedCode, setLaunchedCode] = useState('');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const pendingRaceDeletes = useRef(new Set<string>());
  const pendingRaceEnds = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) {
      setRaces([]);
      setLoading(false);
      return;
    }
    if (liveLoading) return;
    if (liveRaces.length > 0) {
      pendingRaceDeletes.current.forEach((id) => {
        if (!liveRaces.some((r) => String(r.id || r.raceId) === id)) {
          pendingRaceDeletes.current.delete(id);
        }
      });
      pendingRaceEnds.current.forEach((id) => {
        const live = liveRaces.find((r) => String(r.id || r.raceId) === id);
        if (!live || getRaceStatus(live as SpaceRace) === 'completed') {
          pendingRaceEnds.current.delete(id);
        }
      });
      setRaces(
        liveRaces
          .filter((r) => !pendingRaceDeletes.current.has(String(r.id || r.raceId)))
          .map((r) => {
            const id = String(r.id || r.raceId);
            if (pendingRaceEnds.current.has(id)) {
              return { ...r, status: 'completed' };
            }
            return r;
          }) as SpaceRace[]
      );
      setLoading(false);
      return;
    }
    listSpaceRaces()
      .then((rows) => {
        const owned = (rows || []).filter(
          (r) => !uid || String(r.createdBy || '') === uid
        ) as SpaceRace[];
        pendingRaceDeletes.current.forEach((id) => {
          if (!owned.some((r) => String(r.id || r.raceId) === id)) {
            pendingRaceDeletes.current.delete(id);
          }
        });
        pendingRaceEnds.current.forEach((id) => {
          const live = owned.find((r) => String(r.id || r.raceId) === id);
          if (!live || getRaceStatus(live) === 'completed') {
            pendingRaceEnds.current.delete(id);
          }
        });
        setRaces(
          owned
            .filter((r) => !pendingRaceDeletes.current.has(String(r.id || r.raceId)))
            .map((r) => {
              const id = String(r.id || r.raceId);
              return pendingRaceEnds.current.has(id) ? { ...r, status: 'completed' } : r;
            })
        );
      })
      .catch(() => setRaces([]))
      .finally(() => setLoading(false));
  }, [uid, liveRaces, liveLoading]);

  useEffect(() => {
    const nonDraft = races.filter((r) => getRaceStatus(r) !== 'draft');
    nonDraft.forEach(async (race) => {
      const id = race.id || race.raceId;
      if (!id || miniBoards[id]) return;
      try {
        const { participants, teamScores } = await getRaceParticipants(id);
        const standings = buildTeamStandings(
          race.settings?.numberOfTeams || race.teamsCount || 2,
          teamScores,
          participants
        );
        setMiniBoards((prev) => ({ ...prev, [id]: standings.slice(0, 3) }));
      } catch {
        // ignore
      }
    });
  }, [races]);

  const stats = useMemo(() => {
    const draft = races.filter((r) => getRaceStatus(r) === 'draft').length;
    const active = races.filter((r) => getRaceStatus(r) === 'active').length;
    const completed = races.filter((r) => getRaceStatus(r) === 'completed').length;
    return { draft, active, completed };
  }, [races]);

  const activeRace = races.find((r) => getRaceStatus(r) === 'active');

  const filtered = useMemo(() => {
    let rows = races;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((r) => String(r.title || '').toLowerCase().includes(term));
    }
    if (filter === 'all') return rows;
    return rows.filter((r) => getRaceStatus(r) === filter);
  }, [races, search, filter]);

  useEffect(() => {
    setVisibleRaceCount(RACES_PAGE_SIZE);
  }, [filter, search]);

  const visibleRaces = useMemo(
    () => filtered.slice(0, visibleRaceCount),
    [filtered, visibleRaceCount]
  );

  const openCreate = () => {
    router.push('/host/space-race/create' as Href);
  };

  const onStartDraft = async (race: SpaceRace) => {
    const id = race.id || race.raceId;
    if (!id) return;
    if (!activeSession?.sessionCode) {
      showAlert({
        type: 'warning',
        title: 'No active session',
        message: 'Create an active session on Explore before launching a Space Race.',
        primary: { label: 'Close' },
      });
      return;
    }
    if (activeRace && (activeRace.id || activeRace.raceId) !== id) {
      showActivityBlockedAlert(activeSession?.currentActivity);
      return;
    }
    try {
      const updated = await updateSpaceRaceStatus(id, 'active');
      setRaces((prev) =>
        prev.map((r) => ((r.id || r.raceId) === id ? { ...r, ...(updated || { status: 'active' }) } : r))
      );
      const code = updated?.joinCode || activeSession.sessionCode;
      setLaunchedCode(code || '');
    } catch (error) {
      const message = cleanErrorMessage(error, 'Try again');
      if (isActivityConflictMessage(message)) {
        showLaunchFailureAlert(activeSession?.currentActivity, error);
      } else {
        showAlert({
          type: 'error',
          title: 'Start failed',
          message,
          primary: { label: 'Close' },
        });
      }
    }
  };

  const onEnd = async (raceId: string) => {
    try {
      await endSpaceRace(raceId);
      pendingRaceEnds.current.add(raceId);
      setRaces((prev) =>
        prev.map((r) => ((r.id || r.raceId) === raceId ? { ...r, status: 'completed' } : r))
      );
      showToast({ type: 'success', title: 'Space Race ended' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'End failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id || deleteTarget.raceId;
    if (!id) return;
    setBusy(true);
    try {
      await deleteSpaceRace(id);
      pendingRaceDeletes.current.add(id);
      setRaces((prev) => prev.filter((r) => (r.id || r.raceId) !== id));
      setDeleteTarget(null);
      setSettingsRace(null);
      showToast({ type: 'success', title: 'Removed', message: 'Space Race deleted' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Delete failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveSettings = async (
    raceId: string,
    settings: Record<string, unknown>
  ) => {
    setSettingsBusy(true);
    try {
      const updated = await updateSpaceRace(raceId, { settings });
      setRaces((prev) =>
        prev.map((r) =>
          (r.id || r.raceId) === raceId
            ? { ...r, ...(updated || {}), settings: { ...r.settings, ...settings } }
            : r
        )
      );
      setSettingsRace(null);
      showToast({ type: 'success', title: 'Settings updated' });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Update failed',
        message: cleanErrorMessage(error, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setSettingsBusy(false);
    }
  };

  const copyCode = async (code: string, raceId: string) => {
    await Clipboard.setStringAsync(code);
    setCopiedId(raceId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const listPadBottom = TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[4];

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.topBlock}>
        <View style={styles.banner} accessibilityRole="text">
          {isSessionActive ? (
            <>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
              <Text style={styles.bannerText}>
                Launching to session:{' '}
                <Text style={styles.bannerCode}>{activeSession?.sessionCode || '—'}</Text>
                {' · '}
                {activityLabel}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="warning-outline" size={16} color={COLORS.primary} />
              <Text style={styles.bannerText}>
                {"You'll need an active session to launch a Space Race."}
              </Text>
            </>
          )}
        </View>

        <View style={styles.hero}>
          <View style={styles.heroBrownWash} pointerEvents="none" />
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              Space Race
            </Text>
            <HeroHowItWorksLink onPress={() => setHowItWorksOpen(true)} />
          </View>
          <Text style={styles.heroSubtitle}>Gamified quiz competitions with team leaderboards</Text>
          <HeroStatTiles
            items={[
              { label: 'Draft', value: stats.draft },
              { label: 'Active', value: stats.active },
              { label: 'Completed', value: stats.completed },
            ]}
          />
          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Create Race">
              <Ionicons name="add" size={18} color={COLORS.primary} />
              <Text style={styles.createBtnLabel}>Create Race</Text>
            </Pressable>
            {activeRace ? (
              <Pressable
                style={({ pressed }) => [styles.endBtn, pressed && styles.pressed]}
                onPress={() => onEnd(String(activeRace.id || activeRace.raceId))}
                accessibilityRole="button"
                accessibilityLabel="End Race">
                <Ionicons name="stop" size={16} color={COLORS.white} />
                <Text style={styles.endBtnLabel}>End Race</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <HostFilterChips
        items={FILTERS}
        value={filter}
        onChange={setFilter}
        scrollable
        style={styles.filters}
      />

      <HostSearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search races..."
        accessibilityLabel="Search races"
        style={styles.searchWrap}
      />
    </View>
  );

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleRaces}
          keyExtractor={(item) => String(item.id || item.raceId)}
          {...KEYBOARD_SCROLL_PROPS}
          extraData={{ races, copiedId }}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          ListFooterComponent={
            filtered.length > visibleRaces.length ? (
              <AppButton
                label="Show more"
                variant="secondary"
                onPress={() =>
                  setVisibleRaceCount((count) => count + RACES_PAGE_SIZE)
                }
                style={styles.showMore}
                fullWidth={false}
              />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="rocket-outline"
              title={races.length === 0 ? 'No space races' : 'No races in this category'}
              message={
                races.length === 0
                  ? 'Create your first gamified quiz competition'
                  : 'Try selecting a different filter or create a new race'
              }
              actionLabel="Create Race"
              onAction={openCreate}
            />
          }
          renderItem={({ item }) => {
            const id = String(item.id || item.raceId);
            const status = getRaceStatus(item);
            const badgeLabel =
              status === 'active' ? 'ACTIVE' : status === 'completed' ? 'COMPLETED' : 'DRAFT';
            const participants = toParticipantCount(item.participantsCount, item.participants);
            const teams = item.settings?.numberOfTeams || item.teamsCount || 2;
            const joinCode = item.joinCode || (status === 'active' ? activeSession?.sessionCode : '');
            const board = miniBoards[id] || [];

            return (
              <View style={styles.card}>
                {status === 'active' ? (
                  <View style={styles.activeTopRow}>
                    <View style={styles.activeLeft}>
                      <Text style={styles.activeTitle} numberOfLines={1}>
                        {item.title || 'Space Race'}
                      </Text>
                      <View style={[styles.badge, styles.badgeActive]}>
                        <Text style={[styles.badgeLabel, styles.badgeLabelActive]}>{badgeLabel}</Text>
                      </View>
                    </View>
                    {joinCode ? (
                      <View style={styles.activeCodeGroup}>
                        <Text style={styles.codeMono} numberOfLines={1}>
                          {joinCode}
                        </Text>
                        <Pressable
                          onPress={() => copyCode(joinCode, id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Copy join code"
                          style={styles.copyIcon}>
                          <Ionicons
                            name={copiedId === id ? 'checkmark' : 'copy-outline'}
                            size={18}
                            color={copiedId === id ? COLORS.success : COLORS.inkSecondary}
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.cardTop}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title || 'Space Race'}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          status === 'completed' && styles.badgeCompleted,
                        ]}>
                        <Text
                          style={[
                            styles.badgeLabel,
                            status === 'completed' && styles.badgeLabelCompleted,
                          ]}>
                          {badgeLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.metaRow}>
                  <Meta icon="people-outline" label={`${participants} participants`} />
                  <Meta icon="trophy-outline" label={`${teams} teams`} />
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={COLORS.inkSecondary} />
                    {status === 'active' ? (
                      <RaceTimer race={item} />
                    ) : (
                      <Text style={styles.metaText}>{formatRaceTime(item)}</Text>
                    )}
                  </View>
                </View>

                {board.length > 0 ? (
                  <View style={styles.board}>
                    {board.map((row, index) => (
                      <Text key={row.teamId} style={styles.boardRow}>
                        #{index + 1} Team {row.teamId} — {row.score}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View
                  style={
                    status === 'active'
                      ? styles.activeActions
                      : status === 'draft'
                        ? styles.draftActions
                        : styles.actions
                  }>
                  {status === 'draft' ? (
                    <>
                      <View style={styles.actions}>
                        <Action
                          label="Edit"
                          icon="create-outline"
                          onPress={() => setSettingsRace(item)}
                        />
                        <Action
                          label="Launch"
                          icon="play-outline"
                          primary
                          onPress={() => onStartDraft(item)}
                        />
                      </View>
                      <Action
                        label="Delete"
                        icon="trash-outline"
                        danger
                        fullWidth
                        onPress={() => setDeleteTarget(item)}
                      />
                    </>
                  ) : null}
                  {status === 'active' ? (
                    <>
                      <View style={styles.actions}>
                        <Action
                          label="View Responses"
                          icon="eye-outline"
                          onPress={() => router.push(`/host/space-race/${id}/display` as Href)}
                        />
                        <Action
                          label="Edit"
                          icon="create-outline"
                          onPress={() => setSettingsRace(item)}
                        />
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.endRaceInline, pressed && styles.pressed]}
                        onPress={() => onEnd(id)}
                        accessibilityRole="button"
                        accessibilityLabel="End Race">
                        <Ionicons name="stop" size={14} color={COLORS.white} />
                        <Text style={styles.endRaceInlineLabel} numberOfLines={1}>
                          End Race
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  {status === 'completed' ? (
                    <>
                      <Action
                        label="View Responses"
                        icon="eye-outline"
                        onPress={() => router.push(`/host/space-race/${id}/display` as Href)}
                      />
                      <Action
                        label="Delete"
                        icon="trash-outline"
                        danger
                        onPress={() => setDeleteTarget(item)}
                      />
                    </>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <ConfirmModal
        visible={Boolean(deleteTarget)}
        title="Delete race?"
        message="This permanently removes the race, participants, scores, and messages."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />

      <SpaceRaceSettingsModal
        race={settingsRace}
        visible={Boolean(settingsRace)}
        busy={settingsBusy}
        onClose={() => setSettingsRace(null)}
        onSave={onSaveSettings}
        onDelete={(raceId) => {
          const race = races.find((r) => (r.id || r.raceId) === raceId) || null;
          setSettingsRace(null);
          setDeleteTarget(race);
        }}
      />

      <ActivityCreatedModal
        visible={Boolean(launchedCode)}
        title="Space Race Created"
        code={launchedCode}
        onClose={() => setLaunchedCode('')}
      />

      <Modal
        visible={howItWorksOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHowItWorksOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setHowItWorksOpen(false)}>
          <Pressable style={styles.howSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.howTitle}>How Space Race works</Text>
            {HOW_IT_WORKS.map((step) => (
              <Text key={step} style={styles.howStep}>
                • {step}
              </Text>
            ))}
            <Pressable
              style={styles.howClose}
              onPress={() => setHowItWorksOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={styles.howCloseLabel}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardSafeScreen>
  );
}

function Meta({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={COLORS.inkSecondary} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function Action({
  label,
  icon,
  onPress,
  danger,
  primary,
  fullWidth,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  primary?: boolean;
  fullWidth?: boolean;
}) {
  const iconColor = primary ? COLORS.white : danger ? '#B3261E' : '#2B1F27';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.action,
        primary && styles.actionPrimary,
        danger && styles.actionDanger,
        fullWidth && styles.actionFullWidth,
        pressed &&
          (danger ? styles.actionDangerPressed : styles.actionPressed),
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={iconColor} />
      <Text
        style={[
          styles.actionLabel,
          primary && styles.actionPrimaryLabel,
          danger && styles.actionDangerLabel,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING[4], gap: SPACING[3] },
  showMore: {
    alignSelf: 'center',
    marginVertical: SPACING[4],
  },
  listHeader: { marginBottom: 4 },
  topBlock: { gap: SPACING[3] },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
  },
  bannerText: { flex: 1, fontSize: 13, color: COLORS.ink, lineHeight: 18 },
  bannerCode: { fontWeight: FONT_WEIGHTS.bold, color: COLORS.primary },
  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.3)',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    overflow: 'hidden',
  },
  heroBrownWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(58,46,42,0.22)',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'nowrap',
  },
  heroTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 16,
  },
  heroActions: { flexDirection: 'row', gap: SPACING[2], marginTop: 12 },
  createBtn: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACING[2],
  },
  createBtnLabel: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.bold,
    fontSize: 12,
  },
  endBtn: {
    flex: 1,
    minHeight: 44,
    minWidth: 0,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: SPACING[2],
  },
  endBtnLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 12 },
  filters: { marginTop: 16, flexGrow: 0 },
  searchWrap: { marginTop: 12 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SPACING[4],
    gap: SPACING[3],
    marginBottom: SPACING[3],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  activeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ink,
  },
  activeCodeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  cardTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.ink,
    flexShrink: 1,
    minWidth: 0,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1EDF0',
    flexShrink: 0,
  },
  badgeActive: { backgroundColor: '#DCFCE7' },
  badgeCompleted: { backgroundColor: '#F1EDF0' },
  badgeLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    color: '#5F5460',
  },
  badgeLabelActive: { color: '#15803D' },
  badgeLabelCompleted: { color: '#5F5460' },
  activeActions: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    width: '100%',
  },
  endRaceInline: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    minHeight: 40,
    paddingHorizontal: 6,
  },
  endRaceInlineLabel: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  codeMono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.ink,
    flexShrink: 0,
  },
  copyIcon: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[3] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: COLORS.inkSecondary },
  board: {
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.sm,
    padding: SPACING[3],
    gap: 2,
  },
  boardRow: { fontSize: 12, color: COLORS.ink },
  draftActions: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    width: '100%',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: 12,
    width: '100%',
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E3D9E0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  actionLabel: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
  actionPrimary: {
    backgroundColor: '#6B3A5C',
    borderColor: '#6B3A5C',
  },
  actionPrimaryLabel: { color: COLORS.white },
  actionFullWidth: {
    flex: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  actionDanger: {
    borderColor: '#F5B5B0',
    backgroundColor: COLORS.white,
  },
  actionDangerLabel: { color: '#B3261E' },
  actionPressed: { backgroundColor: '#F7F2F5' },
  actionDangerPressed: { backgroundColor: '#FBEAE8' },
  pressed: { opacity: 0.85 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[4],
  },
  howSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: SPACING[5],
    gap: SPACING[2],
  },
  howTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: COLORS.ink, marginBottom: 4 },
  howStep: { fontSize: 14, color: COLORS.inkSecondary, lineHeight: 20 },
  howClose: {
    marginTop: SPACING[3],
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howCloseLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
});
