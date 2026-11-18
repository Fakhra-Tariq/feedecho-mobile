/**
 * Keep in sync with Web/client/src/constants/resourceAllowlist.js
 * and Web/server/utils/resourceAllowlist.js
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;

export const ALLOWED_EXTENSION_SET = new Set<string>(ALLOWED_EXTENSIONS);

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export function formatFileSize(bytes?: number | null) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtensionOf(fileName?: string) {
  const parts = String(fileName || '').toLowerCase().split('.');
  if (parts.length < 2) return '';
  return parts.pop() || '';
}

export function isAllowedResourceFile(fileName?: string, size?: number | null) {
  const ext = fileExtensionOf(fileName);
  if (!ALLOWED_EXTENSION_SET.has(ext)) {
    return {
      ok: false as const,
      error: `That file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`,
    };
  }
  if (typeof size === 'number' && size > MAX_FILE_BYTES) {
    return { ok: false as const, error: 'File is too large. Maximum size is 10 MB.' };
  }
  return { ok: true as const, ext };
}
