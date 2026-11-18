import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { getInitials, SUPERVISOR, TEAM, type TeamMember } from '@/constants/team';

function TeamMemberCard({ member }: { member: TeamMember }) {
  const initials = (member.initials || getInitials(member.name)).trim();
  const hasLinks = Boolean(member.linkedin || member.github);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${member.name}, ${member.role}`}>
      <View
        style={styles.avatarOuter}
        importantForAccessibility="no"
        accessibilityElementsHidden>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {member.name}
      </Text>
      <Text style={styles.role}>{member.role}</Text>
      {member.bio ? <Text style={styles.bio}>{member.bio}</Text> : null}
      {hasLinks ? (
        <View style={styles.links}>
          {member.linkedin ? (
            <Pressable
              onPress={() => Linking.openURL(member.linkedin as string)}
              accessibilityRole="link"
              accessibilityLabel={`${member.name} on LinkedIn`}
              hitSlop={8}
              style={styles.linkBtn}>
              <Ionicons name="logo-linkedin" size={16} color={COLORS.plum} />
            </Pressable>
          ) : null}
          {member.github ? (
            <Pressable
              onPress={() => Linking.openURL(member.github as string)}
              accessibilityRole="link"
              accessibilityLabel={`${member.name} on GitHub`}
              hitSlop={8}
              style={styles.linkBtn}>
              <Ionicons name="logo-github" size={16} color={COLORS.plum} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Marketing About section. Renders inside the host screen's existing ScrollView
 * (do not nest another vertical ScrollView).
 */
export function MeetTheTeam() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const singleColumn = width < 340;
  const rows: TeamMember[][] = [];
  const perRow = singleColumn ? 1 : 2;
  for (let i = 0; i < TEAM.length; i += perRow) {
    rows.push(TEAM.slice(i, i + perRow));
  }

  return (
    <View style={[styles.section, { paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.heading} accessibilityRole="header">
        Meet the <Text style={styles.headingAccent}>Team</Text>
      </Text>
      <Text style={styles.subtitle}>The people behind FeedEcho</Text>

      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row.map((m) => m.name).join('-')} style={styles.row}>
            {row.map((member) => (
              <View key={member.name} style={styles.cell}>
                <TeamMemberCard member={member} />
              </View>
            ))}
            {!singleColumn && row.length === 1 ? <View style={styles.cell} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.divider} />
      <Text style={styles.supervisor}>
        Supervised by <Text style={styles.supervisorName}>{SUPERVISOR.name}</Text>
        {' · '}
        {SUPERVISOR.university}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[8],
  },
  heading: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.ink,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  headingAccent: {
    color: '#6B3A5C',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5F5460',
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    padding: 14,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  avatarOuter: {
    marginBottom: SPACING[3],
  },
  avatarRing: {
    padding: 1,
    borderRadius: RADIUS.full,
    backgroundColor: '#E3D3DD',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1E4EC',
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#6B3A5C',
  },
  name: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    textAlign: 'center',
    width: '100%',
  },
  role: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#6B3A5C',
    textAlign: 'center',
  },
  bio: {
    marginTop: SPACING[2],
    fontSize: 13,
    lineHeight: 18,
    color: '#5F5460',
    textAlign: 'center',
    width: '100%',
  },
  links: {
    marginTop: SPACING[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  linkBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    marginTop: SPACING[6],
    marginBottom: SPACING[4],
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.divider,
  },
  supervisor: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5F5460',
    textAlign: 'center',
  },
  supervisorName: {
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
  },
});
