import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { showAlert } from '@/components/feedback';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { formatSessionDate } from '@/lib/formatLocalDateTime';
import {
  getSharedRaceResources,
  getStudentSpaceRaceHistory,
} from '@/lib/hostSpaceRaces';
import { studentQueryFromProfile } from '@/lib/studentsActivity';

const RESOURCE_FILTERS = ['All', 'Documents', 'Images', 'Links'] as const;
type ResourceFilter = (typeof RESOURCE_FILTERS)[number];

type Resource = {
  id: string;
  type: string;
  fileName: string;
  url: string;
  senderName?: string;
  linkTitle?: string;
  text?: string;
};

type SessionRow = {
  raceId: string;
  quizName: string;
  date: string;
  time: string;
  teamId?: number;
  resources: Resource[];
};

function mapResource(resource: any, index: number): Resource {
  return {
    id: String(resource.id || resource.resourceId || `res-${index}`),
    type: resource.type || 'file',
    fileName: resource.fileName || resource.name || resource.linkTitle || 'Resource',
    url: resource.url || resource.downloadUrl || '',
    senderName: resource.senderName || resource.sharedBy || '',
    linkTitle: resource.linkTitle,
    text: resource.text,
  };
}

function getResourceCategory(resource: Resource) {
  if (resource.type === 'link') return 'Links';
  if (resource.type === 'image') return 'Images';
  return 'Documents';
}

function filterResources(resources: Resource[], activeFilter: ResourceFilter) {
  if (activeFilter === 'All') return resources;
  return resources.filter((r) => getResourceCategory(r) === activeFilter);
}

function getResourceLabel(resource: Resource) {
  if (resource.type === 'link') {
    return resource.linkTitle || resource.url || 'Shared link';
  }
  if (resource.fileName) return resource.fileName;
  if (resource.type === 'image') return 'Shared image';
  return resource.text || 'Shared file';
}

function fileExtension(fileName = '') {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export default function SpaceRaceHistoryScreen() {
  const { profile, user } = useAuth();
  const isGuest = Boolean(profile?.guest) || !profile?.uid;
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resourceFilters, setResourceFilters] = useState<Record<string, ResourceFilter>>({});
  const [previewImage, setPreviewImage] = useState<{ url: string; fileName: string } | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<{ raceId: string; resource: Resource } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (isGuest) {
          if (!cancelled) setSessions([]);
          return;
        }
        const query = studentQueryFromProfile(profile, user);
        const rows = await getStudentSpaceRaceHistory(query);
        const withResources = await Promise.all(
          rows.map(async (row) => {
            const { date, time } = formatSessionDate(row.joinedAt || row.sessionDate);
            let resources: Resource[] = [];
            if (row.raceId && row.teamId != null) {
              try {
                const raw = await getSharedRaceResources(row.raceId, Number(row.teamId), query);
                resources = raw.map(mapResource);
              } catch {
                resources = [];
              }
            }
            return {
              raceId: row.raceId,
              quizName: row.quizName || 'Space Race',
              date,
              time,
              teamId: row.teamId,
              resources,
            };
          })
        );
        if (!cancelled) setSessions(withResources);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isGuest, profile, user]);

  const totalResources = sessions.reduce((sum, s) => sum + s.resources.length, 0);

  const openUrl = async (url?: string) => {
    if (!url || url === '#') {
      showAlert({
        type: 'warning',
        title: 'Unavailable',
        message: 'This resource has no download link.',
        primary: { label: 'Close' },
      });
      return;
    }
    await Linking.openURL(url);
  };

  const handleToggle = (raceId: string) => {
    setExpandedId((prev) => (prev === raceId ? null : raceId));
    setResourceFilters((prev) => ({ ...prev, [raceId]: prev[raceId] || 'All' }));
  };

  const confirmDelete = () => {
    if (!resourceToDelete) return;
    const { raceId, resource } = resourceToDelete;
    setSessions((prev) =>
      prev.map((session) =>
        session.raceId === raceId
          ? { ...session, resources: session.resources.filter((r) => r.id !== resource.id) }
          : session
      )
    );
    setResourceToDelete(null);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading space race history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.pageTitle}>Space Race History</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: COLORS.primary }]}>
              <Ionicons name="rocket-outline" size={16} color={COLORS.white} />
            </View>
            <View style={styles.statCopy}>
              <Text style={styles.statLabel}>Total Sessions</Text>
              <Text style={styles.statValue}>{sessions.length}</Text>
            </View>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: COLORS.secondary }]}>
              <Ionicons name="folder-open-outline" size={16} color={COLORS.white} />
            </View>
            <View style={styles.statCopy}>
              <Text style={styles.statLabel}>Shared Resources</Text>
              <Text style={styles.statValue}>{totalResources}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pastCard}>
          <View style={styles.pastHeader}>
            <Text style={styles.pastTitle}>Past Resources</Text>
            <Text style={styles.pastHint}>Tap a session to view resources shared by your team</Text>
          </View>

          {sessions.length === 0 ? (
            <Text style={styles.empty}>No space race sessions yet.</Text>
          ) : (
            sessions.map((session) => {
              const isExpanded = expandedId === session.raceId;
              const storedFilter = resourceFilters[session.raceId];
              const activeFilter: ResourceFilter =
                storedFilter && RESOURCE_FILTERS.includes(storedFilter) ? storedFilter : 'All';
              const filtered = filterResources(session.resources, activeFilter);
              const grouped =
                activeFilter === 'All'
                  ? RESOURCE_FILTERS.slice(1).map((cat) => ({
                      cat,
                      items: filtered.filter((r) => getResourceCategory(r) === cat),
                    }))
                  : [{ cat: activeFilter, items: filtered }];

              return (
                <View key={session.raceId} style={styles.sessionBlock}>
                  <TouchableOpacity
                    onPress={() => handleToggle(session.raceId)}
                    style={styles.sessionRow}
                    activeOpacity={0.7}>
                    <View style={styles.sessionCopy}>
                      <View style={styles.titleRow}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>
                          {session.quizName}
                        </Text>
                        <View style={styles.teamBadge}>
                          <Text style={styles.teamBadgeText}>Team {session.teamId}</Text>
                        </View>
                      </View>
                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Ionicons name="calendar-outline" size={14} color={COLORS.mutedText} />
                          <Text style={styles.metaText}>{session.date}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="time-outline" size={14} color={COLORS.mutedText} />
                          <Text style={styles.metaText}>{session.time}</Text>
                        </View>
                        <Text style={styles.metaText}>{session.resources.length} resources</Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={COLORS.primary}
                    />
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View style={styles.expandWrap}>
                      <View style={styles.filterRow}>
                        {RESOURCE_FILTERS.map((filter) => {
                          const on = activeFilter === filter;
                          return (
                            <Pressable
                              key={filter}
                              onPress={() =>
                                setResourceFilters((prev) => ({ ...prev, [session.raceId]: filter }))
                              }
                              style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
                              <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                                {filter}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {filtered.length === 0 ? (
                        <Text style={styles.emptySmall}>
                          {activeFilter === 'All'
                            ? 'No resources in this session.'
                            : `No ${activeFilter.toLowerCase()} resources in this session.`}
                        </Text>
                      ) : (
                        grouped.map(({ cat, items }) =>
                          items.length === 0 ? null : (
                            <View key={cat} style={styles.group}>
                              {activeFilter === 'All' ? (
                                <Text style={styles.groupLabel}>{cat}</Text>
                              ) : null}
                              {items.map((resource) => (
                                <View key={resource.id} style={styles.resourceCard}>
                                  <View style={styles.resourceMain}>
                                    <View style={styles.resourceIcon}>
                                      <ResourceThumb resource={resource} />
                                    </View>
                                    <View style={styles.resourceCopy}>
                                      <Text style={styles.resourceTitle} numberOfLines={2}>
                                        {getResourceLabel(resource)}
                                      </Text>
                                      <View style={styles.resourceMeta}>
                                        <Text style={styles.sharedBy} numberOfLines={1}>
                                          {resource.senderName
                                            ? `Shared by ${resource.senderName}`
                                            : 'Shared resource'}
                                        </Text>
                                        <View style={styles.catPill}>
                                          <Text style={styles.catPillText}>
                                            {getResourceCategory(resource)}
                                          </Text>
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                  <View style={styles.actions}>
                                    {resource.type === 'link' && resource.url ? (
                                      <Pressable style={styles.actionBtn} onPress={() => openUrl(resource.url)}>
                                        <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                                        <Text style={styles.actionBtnText}>Open</Text>
                                      </Pressable>
                                    ) : null}
                                    {resource.type === 'image' ? (
                                      <Pressable
                                        style={styles.actionBtn}
                                        onPress={() => {
                                          if (!resource.url || resource.url === '#') return;
                                          setPreviewImage({
                                            url: resource.url,
                                            fileName: resource.fileName || 'Shared image',
                                          });
                                        }}>
                                        <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
                                        <Text style={styles.actionBtnText}>Preview</Text>
                                      </Pressable>
                                    ) : null}
                                    {resource.type !== 'link' ? (
                                      <Pressable
                                        style={styles.actionBtn}
                                        onPress={() => openUrl(resource.url)}>
                                        <Ionicons name="download-outline" size={14} color={COLORS.primary} />
                                        <Text style={styles.actionBtnText}>Download</Text>
                                      </Pressable>
                                    ) : null}
                                    <Pressable
                                      style={styles.trashBtn}
                                      onPress={() => setResourceToDelete({ raceId: session.raceId, resource })}
                                      accessibilityLabel="Delete resource">
                                      <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                                    </Pressable>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )
                        )
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(previewImage)} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setPreviewImage(null)}>
          <Pressable style={styles.previewCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.previewHead}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewImage?.fileName || 'Image preview'}
              </Text>
              <Pressable onPress={() => setPreviewImage(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={COLORS.mutedText} />
              </Pressable>
            </View>
            {previewImage?.url ? (
              <Image source={{ uri: previewImage.url }} style={styles.previewImg} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(resourceToDelete)} transparent animationType="fade">
        <Pressable style={styles.overlay} onPress={() => setResourceToDelete(null)}>
          <Pressable style={styles.deleteCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.deleteTitle}>Delete resource?</Text>
            <Text style={styles.deleteBody}>
              Are you sure you want to delete “
              {resourceToDelete ? getResourceLabel(resourceToDelete.resource) : ''}”?
            </Text>
            <View style={styles.deleteRow}>
              <Pressable style={styles.cancelBtn} onPress={() => setResourceToDelete(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={confirmDelete}>
                <Text style={styles.confirmText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ResourceThumb({ resource }: { resource: Resource }) {
  if (resource.type === 'image' && resource.url && resource.url !== '#') {
    return <Image source={{ uri: resource.url }} style={styles.thumbImg} />;
  }
  if (resource.type === 'link') {
    return <Ionicons name="link-outline" size={20} color={COLORS.primary} />;
  }
  const ext = fileExtension(resource.fileName);
  const color = ext === 'pdf' ? '#DC2626' : ext === 'doc' || ext === 'docx' ? '#2563EB' : COLORS.primary;
  return <Ionicons name="document-text-outline" size={20} color={color} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    gap: SPACING[3],
  },
  loadingText: { color: COLORS.mutedText, fontSize: 14 },
  scroll: { padding: SPACING[4], paddingBottom: SPACING[16] },
  pageTitle: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#1a1a1a',
    marginBottom: SPACING[3],
  },
  statsRow: { flexDirection: 'row', gap: SPACING[2], marginBottom: SPACING[3] },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.white,
    borderWidth: 0.5,
    borderColor: '#E8E0F0',
    borderRadius: 12,
    padding: SPACING[3],
    minHeight: 56,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCopy: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 12, color: '#6B7280' },
  statValue: { fontSize: 17, fontWeight: FONT_WEIGHTS.bold, color: '#1a1a1a' },
  pastCard: {
    backgroundColor: COLORS.white,
    borderWidth: 0.5,
    borderColor: '#E8E0F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pastHeader: {
    padding: SPACING[4],
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E0F0',
  },
  pastTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: '#1a1a1a' },
  pastHint: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  empty: { padding: SPACING[10], textAlign: 'center', color: '#6B7280' },
  emptySmall: { fontSize: 13, color: '#6B7280', paddingVertical: SPACING[2] },
  sessionBlock: { borderBottomWidth: 0.5, borderBottomColor: '#F3EEF8' },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING[4],
    gap: SPACING[2],
  },
  sessionCopy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2], marginBottom: 8 },
  sessionTitle: { flex: 1, fontSize: 16, fontWeight: FONT_WEIGHTS.bold, color: '#1a1a1a' },
  teamBadge: {
    backgroundColor: '#F3EEF8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  teamBadgeText: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium, color: '#6B2D5C' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: '#6B7280' },
  expandWrap: {
    marginHorizontal: SPACING[3],
    marginBottom: SPACING[4],
    backgroundColor: '#FAF8FC',
    borderWidth: 0.5,
    borderColor: '#E8E0F0',
    borderRadius: 12,
    padding: SPACING[3],
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING[3] },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipOn: { backgroundColor: '#6B2D5C' },
  chipOff: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#E8E0F0' },
  chipText: { fontSize: 12, fontWeight: FONT_WEIGHTS.medium },
  chipTextOn: { color: COLORS.white },
  chipTextOff: { color: '#6B7280' },
  group: { marginBottom: SPACING[2], gap: SPACING[2] },
  groupLabel: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6B2D5C',
    marginBottom: 4,
  },
  resourceCard: {
    backgroundColor: COLORS.white,
    borderWidth: 0.5,
    borderColor: '#E8E0F0',
    borderRadius: 8,
    padding: SPACING[3],
    gap: SPACING[3],
  },
  resourceMain: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  resourceIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F3EEF8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: { width: 48, height: 48 },
  resourceCopy: { flex: 1, minWidth: 0 },
  resourceTitle: { fontWeight: FONT_WEIGHTS.medium, color: '#1a1a1a' },
  resourceMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  sharedBy: { flex: 1, fontSize: 12, color: '#6B7280' },
  catPill: {
    backgroundColor: '#F3EEF8',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catPillText: { fontSize: 11, color: '#6B2D5C' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.3)',
  },
  actionBtnText: { fontSize: 13, fontWeight: FONT_WEIGHTS.medium, color: COLORS.primary },
  trashBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACING[4],
  },
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0F0',
  },
  previewTitle: { flex: 1, fontWeight: FONT_WEIGHTS.medium, color: '#1a1a1a', marginRight: 8 },
  previewImg: { width: '100%', height: 320, backgroundColor: '#F9FAFB' },
  deleteCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: SPACING[6],
  },
  deleteTitle: { fontSize: 18, fontWeight: FONT_WEIGHTS.bold, color: '#1a1a1a', marginBottom: 8 },
  deleteBody: { color: '#6B7280', marginBottom: SPACING[6] },
  deleteRow: { flexDirection: 'row', gap: SPACING[3] },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: COLORS.white, fontWeight: FONT_WEIGHTS.medium },
});
