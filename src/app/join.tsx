import { useLocalSearchParams } from 'expo-router';

import { JoinSessionForm } from '@/components/JoinSessionForm';
import { EntryGate } from '@/components/RoleRedirect';

/** Landing / public join entry — redirects hosts and already-joined students. */
export default function JoinSessionScreen() {
  const params = useLocalSearchParams<{ sessionCode?: string; useDifferentName?: string }>();
  const useDifferentName = String(params.useDifferentName || '') === '1';
  return (
    <EntryGate screen="join">
      <JoinSessionForm
        showBack
        entrySource="public"
        prefillCode={String(params.sessionCode || '')}
        useDifferentName={useDifferentName}
      />
    </EntryGate>
  );
}
