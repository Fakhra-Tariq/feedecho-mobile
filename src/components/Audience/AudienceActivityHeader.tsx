import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import { hostInitials } from '@/lib/hostProfile';

const HEADER_ROW_HEIGHT = 56;
const RIGHT_INSET = 14;
const LOGO_HEIGHT = 30;
const LOGO_WIDTH = 90;

type Props = {
  title: string;
  titleIcon?: keyof typeof Ionicons.glyphMap;
  participantName: string;
  isLoggedIn: boolean;
  onLogoPress?: () => void;
  /** Quiz-duration mm:ss. Pass only when the timer belongs in the header. */
  timerSeconds?: number | null;
  /** Replaces the default guest-name / initials avatar (e.g. account button). */
  rightSlot?: ReactNode;
  /**
   * Space Race student chrome: logo left, title center, timer/name right.
   * Other screens keep the previous centered cluster.
   */
  splitZones?: boolean;
  /**
   * Exit Ticket / Live Chat / Quiz: activity name left, title center,
   * guest name or avatar right. No logo or back arrow.
   */
  activityLabel?: string;
};

function formatHeaderCountdown(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function LogoMark({ onPress }: { onPress?: () => void }) {
  const image = (
    <View style={styles.logoClip}>
      <Image
        source={require('../../../assets/images/FeedEcho-logo.png')}
        style={styles.logo}
        contentFit="contain"
        contentPosition="center"
        accessibilityLabel="FeedEcho"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Leave"
        style={styles.logoHit}>
        {image}
      </Pressable>
    );
  }
  return <View style={styles.logoHit}>{image}</View>;
}

function IdentityRight({
  timerSeconds,
  rightSlot,
  isLoggedIn,
  name,
  initials,
  enlargeGuestName,
}: {
  timerSeconds: number | null;
  rightSlot?: ReactNode;
  isLoggedIn: boolean;
  name: string;
  initials: string;
  enlargeGuestName?: boolean;
}) {
  return (
    <>
      {timerSeconds != null && Number.isFinite(timerSeconds) ? (
        <View style={styles.timerPill} accessibilityLabel="Quiz time remaining">
          <Ionicons name="time-outline" size={14} color={COLORS.primary} />
          <Text style={styles.timerText} numberOfLines={1}>
            {formatHeaderCountdown(timerSeconds)}
          </Text>
        </View>
      ) : null}
      {rightSlot != null ? (
        rightSlot
      ) : isLoggedIn ? (
        <View style={styles.avatar} accessibilityLabel={name}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      ) : (
        <Text
          style={[
            styles.guestName,
            enlargeGuestName && styles.guestNameActivity,
            timerSeconds != null && styles.guestNameWithTimer,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {name}
        </Text>
      )}
    </>
  );
}

/** Compact activity chrome. */
export function AudienceActivityHeader({
  title,
  titleIcon,
  participantName,
  isLoggedIn,
  onLogoPress,
  timerSeconds = null,
  rightSlot,
  splitZones = false,
  activityLabel,
}: Props) {
  const insets = useSafeAreaInsets();
  const [rightWidth, setRightWidth] = useState(96);
  const name = participantName.trim() || 'Audience';
  const initials = name ? hostInitials(name) : 'A';
  const sidePad = rightWidth + RIGHT_INSET;
  const label = String(activityLabel || '').trim();

  const onRightLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    setRightWidth((prev) => (prev === next ? prev : next));
  }, []);

  if (label) {
    return (
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, SPACING[2]) }]}>
        <View style={styles.zoneRow}>
          <View style={styles.leftZone}>
            <Text style={styles.activityLabel} numberOfLines={1} ellipsizeMode="tail">
              {label}
            </Text>
          </View>
          <View style={styles.labelCenterZone}>
            <Text style={styles.activityTitle} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
          </View>
          <View style={styles.rightZone}>
            <IdentityRight
              timerSeconds={timerSeconds}
              rightSlot={rightSlot}
              isLoggedIn={isLoggedIn}
              name={name}
              initials={initials}
              enlargeGuestName
            />
          </View>
        </View>
      </View>
    );
  }

  if (splitZones) {
    return (
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, SPACING[2]) }]}>
        <View style={styles.zoneRow}>
          <View style={styles.leftZone}>
            <LogoMark onPress={onLogoPress} />
          </View>
          <View style={styles.centerZone}>
            {titleIcon ? <Ionicons name={titleIcon} size={16} color={COLORS.primary} /> : null}
            <Text style={styles.zoneTitle} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
          </View>
          <View style={styles.rightZone}>
            <IdentityRight
              timerSeconds={timerSeconds}
              rightSlot={rightSlot}
              isLoggedIn={isLoggedIn}
              name={name}
              initials={initials}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, SPACING[2]) }]}>
      <View style={styles.row}>
        <View
          pointerEvents="box-none"
          style={[styles.centerGroup, { paddingHorizontal: sidePad }]}>
          <View pointerEvents="box-none" style={styles.centerCluster}>
            <LogoMark onPress={onLogoPress} />
            {titleIcon ? <Ionicons name={titleIcon} size={16} color={COLORS.primary} /> : null}
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {title}
            </Text>
          </View>
        </View>

        <View style={styles.rightGroup} onLayout={onRightLayout}>
          <IdentityRight
            timerSeconds={timerSeconds}
            rightSlot={rightSlot}
            isLoggedIn={isLoggedIn}
            name={name}
            initials={initials}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING[2],
  },
  zoneRow: {
    height: HEADER_ROW_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  leftZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  centerZone: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  labelCenterZone: {
    flex: 1.2,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  activityLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.header,
  },
  activityTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  zoneTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  rightZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
  },
  row: {
    position: 'relative',
    height: HEADER_ROW_HEIGHT,
    width: '100%',
    justifyContent: 'center',
  },
  centerGroup: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 0,
  },
  centerCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    maxWidth: '100%',
    minWidth: 0,
  },
  logoHit: {
    flexShrink: 0,
  },
  logoClip: {
    height: LOGO_HEIGHT,
    width: LOGO_WIDTH,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    height: LOGO_HEIGHT,
    width: LOGO_WIDTH,
    mixBlendMode: 'multiply',
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  rightGroup: {
    position: 'absolute',
    right: RIGHT_INSET,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    zIndex: 2,
    elevation: 2,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: COLORS.blush,
    flexShrink: 0,
  },
  timerText: {
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
    fontVariant: ['tabular-nums'],
  },
  guestName: {
    maxWidth: 120,
    fontSize: 12,
    color: COLORS.inkSecondary,
    textAlign: 'right',
    flexShrink: 0,
  },
  guestNameActivity: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
  },
  guestNameWithTimer: {
    maxWidth: 88,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
