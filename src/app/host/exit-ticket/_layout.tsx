import { Stack } from 'expo-router';

import { HostProfileButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

export default function ExitTicketStackLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Exit Tickets' }} />
      <Stack.Screen name="create" options={{ title: 'Create Exit Ticket' }} />
      <Stack.Screen
        name="[id]/responses"
        options={{
          title: 'Responses',
          presentation: 'transparentModal',
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
