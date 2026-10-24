import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { showAlert } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import {
  collectReportDataForQuiz,
  computeTeacherOverviewStats,
} from '@/lib/hostQuizReports';
import {
  changeHostPassword,
  hostDisplayName,
  hostInitials,
  readHostUserProfile,
  updateHostUserProfile,
  type HostProfileRecord,
} from '@/lib/hostProfile';
import { useQuizSubmissionListeners } from '@/lib/useQuizSubmissionListeners';

/** Same quiz list source as Web useHostProfileStats: GET /quizzes, no status filter. */
async function listQuizzesForHostProfile() {
  const response = await apiRequest<{ success?: boolean; data?: any[] }>('/quizzes');
  const list = Array.isArray(response.data) ? response.data : [];
  return list
    .slice()
    .map((quiz) => ({ ...quiz, id: String(quiz?.id || '') }))
    .filter((quiz) => quiz.id)
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
    );
}

type OverviewStats = { totalQuizzes: number; totalParticipants: number; avgScore: number };

export default function HostProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const uid = user?.uid || profile?.uid || '';

  const [record, setRecord] = useState<HostProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [school, setSchool] = useState('');
  const [subject, setSubject] = useState('');
  const [experience, setExperience] = useState('');
  const [location, setLocation] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const quizIds = useMemo(() => quizzes.map((q) => q.id).filter(Boolean), [quizzes]);
  const { submissionsByQuizId, participantsByQuizId, ready: listenersReady } =
    useQuizSubmissionListeners(quizIds, { listenParticipants: true });

  const stats = useMemo((): OverviewStats => {
    if (!quizzes.length) {
      return { totalQuizzes: 0, totalParticipants: 0, avgScore: 0 };
    }
    const reports = quizzes.map((quiz) =>
      collectReportDataForQuiz(quiz, submissionsByQuizId, participantsByQuizId, {}, {
        includeDetails: false,
      })
    );
    return computeTeacherOverviewStats(reports as any) as OverviewStats;
  }, [quizzes, submissionsByQuizId, participantsByQuizId]);

  const displayName = hostDisplayName(record, profile?.name || 'Host');
  const email = record?.email || profile?.email || user?.email || '';
  const avatarUrl = record?.profileImage || null;

  useEffect(() => {
    (async () => {
      if (!uid) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const row = await readHostUserProfile(uid);
        setRecord(row);
        const name = hostDisplayName(row, profile?.name || 'Host');
        setFullName(name);
        setBio(row?.bio || '');
        setSchool(row?.school || '');
        setSubject(row?.subject || '');
        setExperience(row?.experience || '');
        setLocation(row?.location || '');

        const list = await listQuizzesForHostProfile();
        setQuizzes(list);
      } catch {
        setRecord(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, profile?.name]);

  const formatJoined = (iso?: string | null) => {
    if (!iso) return 'Unknown';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const openEdit = () => {
    setFullName(displayName);
    setBio(record?.bio || '');
    setSchool(record?.school || '');
    setSubject(record?.subject || '');
    setExperience(record?.experience || '');
    setLocation(record?.location || '');
    setEditOpen(true);
  };

  const onSaveProfile = async () => {
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');
    setSaving(true);
    try {
      const updated = await updateHostUserProfile({
        firstName,
        lastName,
        bio,
        school: school.trim(),
        subject: subject.trim(),
        experience: experience.trim(),
        location: location.trim(),
      });
      if (updated) {
        setRecord({ ...updated, uid });
      } else {
        setRecord((prev) =>
          prev
            ? {
                ...prev,
                firstName,
                lastName,
                displayName: fullName.trim(),
                bio,
                school: school.trim(),
                subject: subject.trim(),
                experience: experience.trim(),
                location: location.trim(),
              }
            : prev
        );
      }
      setEditOpen(false);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Update failed',
        message: cleanErrorMessage(error, 'Could not save profile.'),
        primary: { label: 'Close' },
      });
    } finally {
      setSaving(false);
    }
  };

  const onPickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({
        type: 'warning',
        title: 'Permission needed',
        message: 'Allow photo library access to update your avatar.',
        primary: { label: 'Close' },
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : null;
    if (!base64) {
      showAlert({
        type: 'error',
        title: 'Upload failed',
        message: 'Could not read the selected image.',
        primary: { label: 'Close' },
      });
      return;
    }
    setUploadingAvatar(true);
    try {
      const updated = await updateHostUserProfile({ profileImage: base64 });
      if (updated) setRecord({ ...updated, uid });
      else setRecord((prev) => (prev ? { ...prev, profileImage: base64 } : prev));
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Upload failed',
        message: cleanErrorMessage(error, 'Could not update photo.'),
        primary: { label: 'Close' },
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSavePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!currentPassword) {
      setPasswordError('Current password is required');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordSaving(true);
    const result = await changeHostPassword(currentPassword, newPassword);
    setPasswordSaving(false);
    if (!result.success) {
      setPasswordError(result.error || 'Failed to update password');
      return;
    }
    setPasswordSuccess('Password updated!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setPasswordSuccess('');
      setPasswordOpen(false);
    }, 1200);
  };

  const onLogout = async () => {
    await signOut();
    router.replace('/' as Href);
  };

  /** Web Delete account currently only logs out and returns to host sign-in. */
  const onDeleteAccount = () => {
    showAlert({
      type: 'destructive',
      title: 'Delete account',
      message: 'This action is permanent and cannot be undone. Continue?',
      primary: {
        label: 'Delete',
        onPress: async () => {
          await signOut();
          router.replace('/host-login' as Href);
        },
      },
      secondary: { label: 'Cancel' },
      dismissOnBackdrop: false,
    });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  const statsLoading = quizIds.length > 0 && !listenersReady;

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP },
        ]}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Host profile</Text>
            <Text style={styles.hint}>Manage your profile and account</Text>
          </View>
          <AppButton
            label="Edit profile"
            icon="pencil-outline"
            size="sm"
            fullWidth={false}
            onPress={openEdit}
            style={styles.editBtn}
          />
        </View>

        <AppCard style={styles.card}>
          <View style={styles.identityRow}>
            <TouchableOpacity
              onPress={onPickAvatar}
              disabled={uploadingAvatar}
              style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{hostInitials(displayName)}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator color={COLORS.white} size="small" />
                ) : (
                  <Ionicons name="camera" size={12} color={COLORS.white} />
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.email}>{email}</Text>
            </View>
          </View>

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
              <Text style={styles.chipText}>Joined {formatJoined(record?.createdAt)}</Text>
            </View>
            {record?.experience ? (
              <View style={[styles.chip, styles.chipMuted]}>
                <Ionicons name="ribbon-outline" size={14} color={COLORS.mutedText} />
                <Text style={[styles.chipText, { color: COLORS.mutedText }]}>
                  {record.experience} experience
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.stats}>
            {[
              ['Quizzes created', statsLoading ? '…' : String(stats.totalQuizzes)],
              ['Total participants', statsLoading ? '…' : String(stats.totalParticipants)],
              ['Average score', statsLoading ? '…' : `${stats.avgScore}%`],
            ].map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {record?.bio ? (
            <View style={styles.bioBlock}>
              <Text style={styles.fieldLabel}>Bio</Text>
              <Text style={styles.bioText}>{record.bio}</Text>
            </View>
          ) : null}

          <Detail icon="business-outline" label="School" value={record?.school || 'Not set'} />
          <Detail icon="book-outline" label="Subject" value={record?.subject || 'Not set'} />
          <Detail
            icon="ribbon-outline"
            label="Experience"
            value={record?.experience || 'Not set'}
          />
          <Detail
            icon="location-outline"
            label="Location"
            value={record?.location || 'Not set'}
          />
        </AppCard>

        <AppCard style={styles.card}>
          <Text style={styles.section}>Security</Text>
          <SettingsRow
            icon="lock-closed-outline"
            label="Change password"
            onPress={() => {
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
              setPasswordError('');
              setPasswordSuccess('');
              setPasswordOpen(true);
            }}
          />
          <Text style={[styles.section, { marginTop: SPACING[4] }]}>Account</Text>
          <SettingsRow icon="log-out-outline" label="Log out" onPress={onLogout} />
          <View style={styles.dangerBox}>
            <TouchableOpacity style={styles.dangerBtn} onPress={onDeleteAccount}>
              <Ionicons name="trash-outline" size={16} color={COLORS.dangerText} />
              <Text style={styles.dangerText}>Delete account</Text>
            </TouchableOpacity>
            <Text style={styles.dangerHint}>
              This action is permanent and cannot be undone.
            </Text>
          </View>
        </AppCard>
      </ScrollView>

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardSafeScreen
            variant="modal"
            style={styles.modalCard}
            contentContainerStyle={{ paddingBottom: KEYBOARD_BOTTOM_GAP }}>
              <Text style={styles.modalTitle}>Edit profile</Text>
              <Field label="Full name" value={fullName} onChangeText={setFullName} />
              <Field label="Bio" value={bio} onChangeText={setBio} multiline />
              <Field label="School" value={school} onChangeText={setSchool} />
              <Field label="Subject" value={subject} onChangeText={setSubject} />
              <Field label="Experience" value={experience} onChangeText={setExperience} />
              <Field label="Location" value={location} onChangeText={setLocation} />
              <AppButton
                label={saving ? 'Saving...' : 'Save'}
                loading={saving}
                onPress={onSaveProfile}
              />
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={() => setEditOpen(false)}
                style={{ marginTop: SPACING[2] }}
              />
          </KeyboardSafeScreen>
        </View>
      </Modal>

      <Modal
        visible={passwordOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPasswordOpen(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardSafeScreen
            variant="modal"
            style={styles.modalCard}
            contentContainerStyle={{ paddingBottom: KEYBOARD_BOTTOM_GAP }}>
              <Text style={styles.modalTitle}>Change password</Text>
              <Field
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
              <Field
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
              {passwordSuccess ? <Text style={styles.success}>{passwordSuccess}</Text> : null}
              <AppButton
                label={passwordSaving ? 'Updating...' : 'Update password'}
                loading={passwordSaving}
                onPress={onSavePassword}
              />
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={() => setPasswordOpen(false)}
                style={{ marginTop: SPACING[2] }}
              />
          </KeyboardSafeScreen>
        </View>
      </Modal>
    </KeyboardSafeScreen>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <Text style={styles.settingsLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={COLORS.iconMuted} />
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: SPACING[3] }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, multiline && styles.multiline]}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        placeholderTextColor={COLORS.darkTextSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  content: { padding: SPACING[6], gap: SPACING[4], paddingBottom: SPACING[16] },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING[3] },
  heading: { ...TYPE.title },
  hint: { ...TYPE.subtitle, marginTop: SPACING[1] },
  editBtn: { minWidth: 120 },
  card: { ...SHADOWS.raised },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[4], marginBottom: SPACING[4] },
  avatarWrap: { position: 'relative' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: COLORS.white, fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...TYPE.bodyStrong, fontSize: 20 },
  email: { ...TYPE.caption, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2], marginBottom: SPACING[4] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
  },
  chipMuted: { backgroundColor: COLORS.mutedSoft },
  chipText: { color: COLORS.primary, fontSize: 12, fontWeight: FONT_WEIGHTS.medium },
  stats: { flexDirection: 'row', gap: SPACING[2], marginBottom: SPACING[4] },
  stat: {
    flex: 1,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    alignItems: 'center',
  },
  statValue: { ...TYPE.bodyStrong, fontSize: 16 },
  statLabel: { ...TYPE.caption, marginTop: 2, textAlign: 'center' },
  bioBlock: { marginBottom: SPACING[3] },
  bioText: { color: COLORS.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  fieldLabel: {
    color: COLORS.darkTextSecondary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.divider,
  },
  detailValue: { color: COLORS.text, fontSize: 14 },
  section: {
    color: COLORS.darkTextSecondary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING[2],
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
  },
  settingsLabel: { flex: 1, color: COLORS.text, fontWeight: FONT_WEIGHTS.medium },
  dangerBox: {
    marginTop: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerText: { color: COLORS.dangerText, fontWeight: FONT_WEIGHTS.semibold },
  dangerHint: {
    color: COLORS.dangerText,
    opacity: 0.8,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING[6],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING[5],
    maxHeight: '90%',
  },
  modalTitle: { ...TYPE.title, marginBottom: SPACING[4] },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingHorizontal: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: SPACING[3] },
  error: { color: COLORS.dangerText, marginBottom: SPACING[3] },
  success: { color: COLORS.successText, marginBottom: SPACING[3] },
});
