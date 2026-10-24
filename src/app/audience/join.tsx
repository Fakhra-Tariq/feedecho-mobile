import { JoinSessionForm } from '@/components/JoinSessionForm';

/** Audience tab — join another session without the landing EntryGate. */
export default function AudienceJoinScreen() {
  return <JoinSessionForm entrySource="student" />;
}
