import { Tabs } from 'expo-router';

import { HostProfileButton } from '@/components/HostProfileButton';
import { TAB_BAR_INACTIVE_COLOR, TabBarGlyph, TabBarLabel } from '@/components/TabBarGlyph';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';
import { useSafeTabBarStyle } from '@/lib/tabBarSafeArea';

/**
 * Host tabs: Explore → Sessions → Quiz → Library → Chat → Race → Ticket → Reports
 * Profile is reached from the header avatar/name (same as Web navbar).
 */
export default function HostTabsLayout() {
  const tabBarStyle = useSafeTabBarStyle({
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  });

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.ink },
        headerShadowVisible: false,
        headerRight: () => <HostProfileButton />,
        headerTitleContainerStyle: { maxWidth: '70%' },
        tabBarActiveTintColor: COLORS.plumInk,
        tabBarInactiveTintColor: TAB_BAR_INACTIVE_COLOR,
        tabBarStyle,
        tabBarItemStyle: { flex: 1, minHeight: 44, paddingHorizontal: 0 },
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: COLORS.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Explore</TabBarLabel>,
          tabBarAccessibilityLabel: 'Explore',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="compass-outline" filled="compass" />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Sessions</TabBarLabel>,
          tabBarAccessibilityLabel: 'Sessions',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="calendar-outline" filled="calendar" />
          ),
        }}
      />
      <Tabs.Screen
        name="quiz"
        options={{
          title: 'Quiz',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Quiz</TabBarLabel>,
          tabBarAccessibilityLabel: 'Quiz',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="help-circle-outline" filled="help-circle" />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          headerTitleAlign: 'left',
          headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Library</TabBarLabel>,
          tabBarAccessibilityLabel: 'Library',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="library-outline" filled="library" />
          ),
        }}
      />
      <Tabs.Screen
        name="live-chat"
        options={{
          title: 'Anonymous Chat',
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: FONT_WEIGHTS.medium,
            color: COLORS.ink,
          },
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Chat</TabBarLabel>,
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph
              focused={focused}
              outline="chatbubbles-outline"
              filled="chatbubbles"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="space-race"
        options={{
          title: 'Space Race',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Race</TabBarLabel>,
          tabBarAccessibilityLabel: 'Race',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="rocket-outline" filled="rocket" />
          ),
        }}
      />
      <Tabs.Screen
        name="exit-ticket"
        options={{
          title: 'Exit Ticket',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Ticket</TabBarLabel>,
          tabBarAccessibilityLabel: 'Ticket',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph
              focused={focused}
              outline="document-text-outline"
              filled="document-text"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarLabel: ({ focused }) => <TabBarLabel focused={focused}>Reports</TabBarLabel>,
          tabBarAccessibilityLabel: 'Reports',
          tabBarIcon: ({ focused }) => (
            <TabBarGlyph focused={focused} outline="stats-chart-outline" filled="stats-chart" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: 'Host profile',
        }}
      />
    </Tabs>
  );
}
