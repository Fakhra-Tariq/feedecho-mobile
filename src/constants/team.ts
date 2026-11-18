/**
 * Must stay in sync with Web/client/src/components/marketing/MeetTheTeam.js
 */

export type TeamMember = {
  name: string;
  role: string;
  bio?: string;
  linkedin?: string;
  github?: string;
  initials?: string;
};

export const TEAM: TeamMember[] = [
  { name: 'Fakhra Tariq', role: 'Co-founder' },
  { name: 'Hafiza Urooj Fatima', role: 'Co-founder' },
  { name: 'Khansa M. Yahya', role: 'Co-founder' },
  { name: 'Sundus Nadeem', role: 'Co-founder' },
];

export const SUPERVISOR = {
  name: 'Ms Surayya Obaid',
  university: 'Jinnah University For Women',
};

export function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}
