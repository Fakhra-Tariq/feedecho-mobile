import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type AppButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  variant = 'primary',
  icon,
  loading,
  fullWidth = true,
  size = 'md',
  disabled,
  style,
  ...rest
}: AppButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        fullWidth && styles.fullWidth,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style as StyleProp<ViewStyle>,
      ]}
      android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? COLORS.primary : COLORS.white} />
      ) : (
        <View style={styles.row}>
          {icon ? (
            <Ionicons
              name={icon}
              size={size === 'sm' ? 16 : 18}
              color={
                variant === 'secondary' || variant === 'ghost'
                  ? COLORS.primary
                  : COLORS.white
              }
            />
          ) : null}
          <Text
            style={[
              styles.label,
              (variant === 'secondary' || variant === 'ghost') && styles.labelDark,
              variant === 'danger' && styles.labelLight,
            ]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[5],
  },
  sm: { minHeight: 40, paddingHorizontal: SPACING[4] },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: COLORS.primary },
  secondary: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghost: { backgroundColor: COLORS.blush },
  danger: { backgroundColor: COLORS.danger },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  label: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 15,
  },
  labelDark: { color: COLORS.primary },
  labelLight: { color: COLORS.white },
});

export function AppCard({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[cardStyles.card, padded && cardStyles.padded, style]}>{children}</View>;
}

export function PressableCard({
  children,
  style,
  onPress,
  disabled,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      android_ripple={{ color: COLORS.blush }}
      style={({ pressed }) => [
        cardStyles.card,
        cardStyles.padded,
        pressed && onPress && cardStyles.pressed,
        disabled && cardStyles.disabled,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  padded: { padding: SPACING[4] },
  pressed: { opacity: 0.92, backgroundColor: COLORS.surfaceMuted },
  disabled: { opacity: 0.6 },
});

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={emptyStyles.wrap}>
      <View style={emptyStyles.iconWrap}>
        <Ionicons name={icon} size={32} color={COLORS.primary} />
      </View>
      <Text style={emptyStyles.title}>{title}</Text>
      <Text style={emptyStyles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <View style={emptyStyles.action}>
          <AppButton
            label={actionLabel}
            onPress={onAction}
            icon="add-outline"
            fullWidth={false}
            style={emptyStyles.actionBtn}
          />
        </View>
      ) : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: SPACING[10],
    paddingHorizontal: SPACING[6],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[4],
  },
  title: { ...TYPE.bodyStrong, fontSize: 18, textAlign: 'center' },
  message: {
    ...TYPE.caption,
    textAlign: 'center',
    marginTop: SPACING[2],
    maxWidth: 280,
  },
  action: {
    marginTop: SPACING[5],
    alignSelf: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    alignSelf: 'center',
    minWidth: 220,
    maxWidth: 280,
    minHeight: 48,
    paddingHorizontal: 28,
  },
});

export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={headerStyles.wrap}>
      <Text style={TYPE.title}>{title}</Text>
      {subtitle ? <Text style={[TYPE.subtitle, headerStyles.sub]}>{subtitle}</Text> : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: { marginBottom: SPACING[4] },
  sub: { marginTop: SPACING[1] },
});

export function SectionDivider() {
  return <View style={dividerStyles.line} />;
}

const dividerStyles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING[3],
  },
});
