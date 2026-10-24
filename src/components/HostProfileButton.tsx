import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, SHADOWS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { hostInitials } from '@/lib/hostProfile';

/**
 * Host header avatar — matches Web HostLayout dropdown (Profile + Logout).
 * Shared via host/_layout.tsx headerRight on all host tabs.
 */
export function HostProfileButton() {
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const name = profile?.name || 'Host';
  const email = profile?.email || '';

  const close = () => setOpen(false);

  const onProfile = () => {
    close();
    router.push('/host/profile' as Href);
  };

  const onLogout = async () => {
    close();
    // Same flow as LogoutButton — AuthContext.signOut, then landing.
    await signOut();
    router.replace('/' as Href);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((prev) => !prev)}
        style={({ pressed }) => [styles.avatarHit, pressed && styles.pressed]}
        hitSlop={8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{hostInitials(name)}</Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent>
        {/* Full-screen backdrop — light dim so Android still receives taps
            (fully transparent Pressables often ignore outside presses). */}
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close menu">
          {/* Nested card Pressable absorbs taps so they don't bubble to backdrop. */}
          <Pressable
            style={[
              styles.menu,
              {
                top: insets.top + 52,
                right: 12,
              },
            ]}
            onPress={() => {}}
            accessibilityViewIsModal>
            <View style={styles.userBlock}>
              <Text style={styles.userName} numberOfLines={1}>
                {name}
              </Text>
              {email ? (
                <Text style={styles.userEmail} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={onProfile}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              accessibilityRole="button"
              accessibilityLabel="Profile">
              <Ionicons name="person-outline" size={18} color="#5F5460" />
              <Text style={styles.itemLabel}>Profile</Text>
            </Pressable>

            <Pressable
              onPress={onLogout}
              style={({ pressed }) => [
                styles.item,
                styles.logoutItem,
                pressed && styles.logoutPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Logout">
              <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              <Text style={styles.logoutLabel}>Logout</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarHit: {
    marginRight: SPACING[4],
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
  backdrop: {
    flex: 1,
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menu: {
    position: 'absolute',
    width: 220,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8DFE6',
    overflow: 'hidden',
    ...SHADOWS.raised,
  },
  userBlock: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFE7EC',
  },
  userName: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
  },
  userEmail: {
    marginTop: 2,
    fontSize: 12,
    color: '#5F5460',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  itemPressed: {
    backgroundColor: '#F7F2F5',
  },
  itemLabel: {
    fontSize: 14,
    color: '#2B1F27',
  },
  logoutItem: {
    borderTopWidth: 1,
    borderTopColor: '#EFE7EC',
  },
  logoutPressed: {
    backgroundColor: '#FBEAE8',
  },
  logoutLabel: {
    fontSize: 14,
    color: '#DC2626',
  },
});
