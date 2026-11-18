import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { JoinSessionForm } from '@/components/JoinSessionForm';
import { isBannerJoinStackActive, setBannerJoinStackActive } from '@/lib/guestSession';

/** Audience tab — join another session without the landing EntryGate. */
export default function AudienceJoinScreen() {
  const params = useLocalSearchParams<{
    fromBanner?: string;
    sessionCode?: string;
    studentName?: string;
    useDifferentName?: string;
  }>();
  const fromBanner = String(params.fromBanner || '') === '1' || isBannerJoinStackActive();
  const useDifferentName = String(params.useDifferentName || '') === '1';
  const paramCode = String(params.sessionCode || '');
  const paramName = useDifferentName ? '' : String(params.studentName || '');

  useEffect(() => {
    if (!fromBanner) return;
    setBannerJoinStackActive(true);
    return () => setBannerJoinStackActive(false);
  }, [fromBanner]);

  return (
    <JoinSessionForm
      entrySource={fromBanner || useDifferentName ? 'public' : 'student'}
      showBack={fromBanner || useDifferentName}
      fromBanner={fromBanner}
      prefillCode={paramCode}
      prefillName={paramName}
      useDifferentName={useDifferentName}
    />
  );
}
