/** Cheap list identity for skipping no-op host workspace setState. */

function field(row: Record<string, unknown>, key: string) {
  const v = row[key];
  if (v == null || v === '') return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  return String(v);
}

export function hostRowSignature(row: unknown): string {
  if (!row || typeof row !== 'object') return String(row ?? '');
  const r = row as Record<string, unknown>;
  return [
    field(r, 'id'),
    field(r, 'status'),
    field(r, 'updatedAt'),
    field(r, 'createdAt'),
    field(r, 'endedAt'),
    field(r, 'startedAt'),
    field(r, 'launched'),
    field(r, 'title'),
    field(r, 'questionCount'),
    field(r, 'responsesCount'),
    field(r, 'joinCode'),
    field(r, 'sessionCode'),
    field(r, 'isActive'),
    field(r, 'isPaused'),
    field(r, 'currentActivity'),
    Array.isArray(r.questions) ? String(r.questions.length) : '',
  ].join('|');
}

export function hostListSignature(rows: unknown[] | null | undefined): string {
  if (!rows?.length) return '0';
  return `${rows.length}:${rows.map(hostRowSignature).join('\n')}`;
}

export function sameHostList(a: unknown[] | null | undefined, b: unknown[] | null | undefined) {
  return hostListSignature(a) === hostListSignature(b);
}

export function sameHostRow(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return hostRowSignature(a) === hostRowSignature(b);
}
