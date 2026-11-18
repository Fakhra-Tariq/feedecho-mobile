import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';

describe('getSessionActivityLabel', () => {
  it('shows Active Quiz from currentActivity even when leftover launched quizzes are expired', () => {
    const label = getSessionActivityLabel(
      { type: 'quiz', activityId: 'live-1', status: 'active' },
      [
        {
          id: 'old-expired',
          launched: true,
          status: 'launched',
          launchSettings: { endTime: '2000-01-01T00:00:00.000Z' },
        },
        {
          id: 'live-1',
          launched: true,
          status: 'launched',
        },
      ]
    );
    expect(label).toBe('Active Quiz');
  });

  it('returns null when idle', () => {
    expect(getSessionActivityLabel(null, [])).toBeNull();
  });
});
