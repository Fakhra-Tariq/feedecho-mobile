import { JoinSessionForm } from '@/components/JoinSessionForm';
import { EntryGate } from '@/components/RoleRedirect';

/** Landing / public join entry — redirects hosts and already-joined students. */
export default function JoinSessionScreen() {
  return (
    <EntryGate screen="join">
      <JoinSessionForm showBack entrySource="public" />
    </EntryGate>
  );
}
