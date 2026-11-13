import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { StudentAccountButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useSafeTabBarStyle } from '@/lib/tabBarSafeArea';

/**
 * Logged-in audience Home / Progress / Study / Profile.
 * Activity screens live on the parent stack so join navigation stays registered.
 */
export default function AudienceTabsLayout() {
  const { loading, isStudent, isHost } = useAuth();
  const tabBarStyle = useSafeTabBarStyle();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (isHost) {
    return <Redirect href={'/host' as Href} />;
  }

  if (!isStudent) {
    return <Redirect href={'/' as Href} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
        headerShadowVisible: false,
        headerTitleContainerStyle: { flex: 1, marginRight: 8 },
        headerRightContainerStyle: { flexShrink: 0 },
        headerRight: () => <StudentAccountButton />,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.iconMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: FONT_WEIGHTS.medium },
        tabBarStyle,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: COLORS.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="study-assistant"
        options={{
          title: 'Study',
          tabBarLabel: 'Study',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
