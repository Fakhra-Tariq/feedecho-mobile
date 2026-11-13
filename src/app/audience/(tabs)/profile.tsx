import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { showAlert, showToast } from '@/components/feedback';
import { AppButton, AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { useAuth } from '@/context/AuthContext';
import {
  readAudienceUserProfile,
  updateAudienceUserProfile,
  type AudienceProfileRecord,
} from '@/lib/audienceProfile';
import { getStudentQuizHistory } from '@/lib/studentsActivity';

export default function AudienceProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const [record, setRecord] = useState<AudienceProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');
  const [university, setUniversity] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [quizStats, setQuizStats] = useState({ total: 0, avg: 0, best: 0 });

  const displayName = useMemo(() => {
    if (record?.displayName) return record.displayName;
    const combined = `${firstName} ${lastName}`.trim();
    return combined || profile?.name || 'Audience';
  }, [record?.displayName, firstName, lastName, profile?.name]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (user?.uid) {
          const row = await readAudienceUserProfile(user.uid);
          setRecord(row);
          setFirstName(row?.firstName || profile?.name?.split(/\s+/)[0] || '');
          setLastName(
            row?.lastName || profile?.name?.split(/\s+/).slice(1).join(' ') || ''
          );
          setBio(row?.bio || '');
          setUniversity(row?.university || '');
          setLocation(row?.location || '');
          setPhone(row?.phone || '');
        } else {
          setFirstName(profile?.name || 'Audience');
        }
        const history = await getStudentQuizHistory({
          uid: user?.uid || profile?.uid || undefined,
          email: profile?.email || undefined,
          name: profile?.name || undefined,
        });
        const total = history.length;
        const avg =
          total === 0
            ? 0
            : Math.round(
                history.reduce(
                  (sum, row) => sum + Number(row.percentage ?? row.score ?? 0),
                  0
                ) / total
              );
        const best = history.reduce(
          (max, row) => Math.max(max, Number(row.percentage ?? row.score ?? 0)),
          0
        );
        setQuizStats({ total, avg, best });
      } catch {
        setRecord(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, profile?.uid, profile?.email, profile?.name]);

  const onSave = async () => {
    if (!user?.uid) {
      showAlert({
        type: 'warning',
        title: 'Sign in required',
        message: 'Create or sign in to an account to edit your profile.',
        primary: { label: 'Close' },
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAudienceUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bio,
        university,
        location,
        phone,
      });
      if (updated) setRecord({ ...updated, uid: user.uid });
      setEditing(false);
      showToast({ type: 'success', title: 'Profile updated' });
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardSafeScreen
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP },
      ]}>
        <AppCard style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(displayName || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>
            {record?.email || profile?.email || (profile?.guest ? 'Guest audience' : '')}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Audience</Text>
          </View>
        </AppCard>

        <View style={styles.stats}>
          {[
            ['Quizzes taken', String(quizStats.total)],
            ['Average score', `${quizStats.avg}%`],
            ['Best score', `${quizStats.best}%`],
          ].map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <AppCard style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.section}>Profile details</Text>
            {user?.uid ? (
              <TouchableOpacity onPress={() => setEditing((v) => !v)}>
                <Text style={styles.link}>{editing ? 'Cancel' : 'Edit'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {editing ? (
            <>
              <Text style={styles.label}>First name</Text>
              <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} />
              <Text style={styles.label}>Last name</Text>
              <TextInput style={styles.input} value={lastName} onChangeText={setLastName} />
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={bio}
                onChangeText={setBio}
                multiline
              />
              <Text style={styles.label}>University</Text>
              <TextInput style={styles.input} value={university} onChangeText={setUniversity} />
              <Text style={styles.label}>Location</Text>
              <TextInput style={styles.input} value={location} onChangeText={setLocation} />
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              <AppButton label={saving ? 'Saving...' : 'Save'} loading={saving} onPress={onSave} />
            </>
          ) : (
            <>
              <Detail icon="school-outline" label="University" value={university || '—'} />
              <Detail icon="location-outline" label="Location" value={location || '—'} />
              <Detail icon="call-outline" label="Phone" value={phone || '—'} />
              <Detail icon="document-text-outline" label="Bio" value={bio || '—'} />
            </>
          )}
        </AppCard>

        <AppButton
          label="Log out"
          variant="danger"
          icon="log-out-outline"
          onPress={() => signOut()}
          style={styles.logout}
        />
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
      <Ionicons name={icon} size={18} color={COLORS.primary} />
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
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
  hero: { ...SHADOWS.raised, alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  avatarText: { color: COLORS.primary, fontSize: 28, fontWeight: FONT_WEIGHTS.bold },
  name: { ...TYPE.title, textAlign: 'center' },
  email: { ...TYPE.caption, marginTop: SPACING[1] },
  badge: {
    marginTop: SPACING[3],
    backgroundColor: COLORS.blush,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
  },
  badgeText: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.semibold, fontSize: 12 },
  stats: { flexDirection: 'row', gap: SPACING[3] },
  stat: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  statValue: { ...TYPE.bodyStrong, fontSize: 18 },
  statLabel: { ...TYPE.caption, marginTop: 2, textAlign: 'center' },
  card: { ...SHADOWS.raised },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  section: { ...TYPE.bodyStrong, fontSize: 16 },
  link: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.medium },
  label: { ...TYPE.label, marginBottom: SPACING[2] },
  input: {
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingHorizontal: SPACING[3],
    marginBottom: SPACING[3],
    color: COLORS.text,
    backgroundColor: COLORS.surfaceMuted,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: SPACING[3] },
  detailRow: {
    flexDirection: 'row',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.divider,
  },
  detailCopy: { flex: 1 },
  detailLabel: { ...TYPE.caption },
  detailValue: { color: COLORS.text, marginTop: 2, fontSize: 15 },
  logout: { marginTop: SPACING[2] },
});
