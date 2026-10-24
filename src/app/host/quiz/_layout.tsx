import { Stack } from 'expo-router';

import { HostProfileButton } from '@/components/HostProfileButton';
import { COLORS, FONT_WEIGHTS } from '@/constants/theme';

export default function QuizStackLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Create a New Quiz' }} />
      <Stack.Screen name="create/[type]" options={{ title: 'Quiz Editor' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit Quiz' }} />
      <Stack.Screen name="import" options={{ title: 'Import Quiz' }} />
      <Stack.Screen name="copy-paste" options={{ title: 'Copy-Paste Quiz' }} />
    </Stack>
  );
}
