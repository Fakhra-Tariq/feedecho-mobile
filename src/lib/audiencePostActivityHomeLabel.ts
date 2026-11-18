/** Same guest vs logged-in signal as GuestProgressLoginBanner (`profile.guest` / student uid). */
export const AUDIENCE_POST_ACTIVITY_HOME_LABEL = {
  guest: 'Back to Join Session',
  loggedIn: 'Back to Dashboard',
} as const;

export function isLoggedInAudienceProfile(profile: { uid?: string; guest?: boolean } | null) {
  return Boolean(profile?.uid && !profile?.guest);
}

export function getAudiencePostActivityHomeLabel(
  profile: { uid?: string; guest?: boolean } | null,
  authLoading: boolean
): string | null {
  if (isLoggedInAudienceProfile(profile)) return AUDIENCE_POST_ACTIVITY_HOME_LABEL.loggedIn;
  if (authLoading) return null;
  return AUDIENCE_POST_ACTIVITY_HOME_LABEL.guest;
}
