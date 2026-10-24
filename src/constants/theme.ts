import { DefaultTheme, type Theme } from 'expo-router';
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * FeedEcho brand tokens from the web app:
 * Web/client/tailwind.config.js and Web/client/src/index.css.
 */
export const COLORS = {
  primary: '#6D415F',
  rosePurple: '#6D415F',
  /** Slightly darker primary for pressed / secondary brand fills */
  primaryDark: '#5A344D',
  blush: '#F1E5EB',
  secondary: '#D4AF37',
  warmGold: '#D4AF37',
  background: '#F4F1EC',
  softIvory: '#F4F1EC',
  text: '#1F2A44',
  deepIndigo: '#1F2A44',
  header: '#1F2A44',
  mutedPurple: '#8E7CC3',
  white: '#FFFFFF',
  border: '#E5E5E5',
  /**
   * Anonymous Chat (and aligned host chrome) UI tokens.
   * Kept alongside legacy brand values so other screens can migrate gradually.
   */
  cream: '#F4F0EA',
  plum: '#6B3A5C',
  plumTint: '#F1E4EC',
  plumTintDeep: '#ECDDE6',
  plumInk: '#4A1F3D',
  plumSoftText: '#EADBE5',
  ink: '#2B1F27',
  inkSecondary: '#5F5460',
  cardBorder: '#E8DFE6',
  tabIdleBorder: '#E3D9E0',
  rowBorder: '#ECE3EA',
  /** Supporting neutrals for dividers / section contrast */
  divider: '#EDE8E3',
  surfaceMuted: '#FAF7F4',
  iconMuted: '#8B8490',
  darkBackground: '#1A0F1A',
  darkSurface: '#2D1F2D',
  darkText: '#FFFFFF',
  darkTextSecondary: '#A0A0A0',
  /** Semantic status — shared across host + audience screens */
  danger: '#EF4444',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  success: '#10B981',
  successSoft: '#DCFCE7',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  successText: '#166534',
  successAccent: '#15803D',
  warning: '#B45309',
  warningSoft: '#FFF7ED',
  warningBorder: '#FED7AA',
  warningText: '#9A3412',
  muted: '#C4C4C4',
  mutedSoft: '#F3F4F6',
  mutedText: '#4B5563',
  overlay: 'rgba(31, 42, 68, 0.45)',
} as const;

/** Distinct team colors for Space Race leaderboards (not brand tokens). */
export const TEAM_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#22C55E',
  '#F59E0B',
  '#A855F7',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#14B8A6',
  '#6366F1',
] as const;

/** Inter, loaded on the web at these weights. */
export const FONT_FAMILY = 'Inter';

export const FONT_WEIGHTS = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Tailwind's default spacing scale, in pixels.
 * The web config does not override spacing.
 */
export const SPACING = {
  px: 1,
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const TYPE = {
  hero: { fontSize: 32, lineHeight: 38, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text } as TextStyle,
  title: { fontSize: 24, lineHeight: 30, fontWeight: FONT_WEIGHTS.bold, color: COLORS.text } as TextStyle,
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: FONT_WEIGHTS.regular,
    color: COLORS.darkTextSecondary,
  } as TextStyle,
  section: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.mutedText,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  } as TextStyle,
  body: { fontSize: 15, lineHeight: 22, fontWeight: FONT_WEIGHTS.regular, color: COLORS.text } as TextStyle,
  bodyStrong: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  } as TextStyle,
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.regular,
    color: COLORS.darkTextSecondary,
  } as TextStyle,
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  } as TextStyle,
} as const;

export const SHADOWS = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1F2A44',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {
      shadowColor: '#1F2A44',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
  })!,
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1F2A44',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {
      shadowColor: '#1F2A44',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
  })!,
} as const;

/**
 * Navigation theme. `card` is the header and tab bar surface,
 * `primary` is the active tint, `background` and `text` are the screen defaults.
 */
export const NAV_THEME: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    primary: COLORS.primary,
    background: COLORS.background,
    card: COLORS.white,
    text: COLORS.text,
    border: COLORS.border,
    notification: COLORS.primary,
  },
};
