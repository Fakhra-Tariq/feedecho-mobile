import { Stack } from 'expo-router';

import { HostProfileButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

export default function SpaceRaceStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.white },
        headerTintColor: COLORS.header,
        headerTitleStyle: { fontWeight: FONT_WEIGHTS.semibold, color: COLORS.header },
        headerTitleContainerStyle: { maxWidth: '70%' },
        headerShadowVisible: false,
        headerRight: () => <HostProfileButton />,
        contentStyle: { backgroundColor: COLORS.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'Space Race' }} />
      <Stack.Screen name="create" options={{ title: 'Launch Space Race' }} />
      <Stack.Screen name="[id]/display" options={{ title: 'Leaderboard' }} />
    </Stack>
  );
}
