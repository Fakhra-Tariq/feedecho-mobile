import { Directory, EncodingType, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const DOCUMENT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export const DOWNLOAD_FAILED_MESSAGE = "Couldn't download the file. Try again.";

export function guessFileMime(fileName?: string, mimeType?: string) {
  const type = String(mimeType || '')
    .toLowerCase()
    .trim();
  if (type && type !== 'application/octet-stream' && type !== 'binary/octet-stream') {
    return type;
  }
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  if (ext && IMAGE_MIME[ext]) return IMAGE_MIME[ext];
  if (ext && DOCUMENT_MIME[ext]) return DOCUMENT_MIME[ext];
  return type || 'application/octet-stream';
}

export function sanitizeDownloadFileName(name?: string) {
  const raw = String(name || 'download').trim() || 'download';
  const extMatch = raw.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const base = (extMatch ? raw.slice(0, -ext.length) : raw)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'file'}${ext}`;
}

export function resolveFileDownloadUrl(source: unknown): string {
  if (source == null) return '';
  if (typeof source === 'string') return source.trim();
  if (typeof source !== 'object') return '';
  const record = source as Record<string, unknown>;
  const candidates = [
    record.url,
    record.fileUrl,
    record.fileURL,
    record.downloadUrl,
    record.downloadURL,
    record.download_url,
    record.href,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() && value.trim() !== '#') {
      return value.trim();
    }
  }
  return '';
}

function isUserCancel(error: unknown) {
  const message = String(
    error instanceof Error ? error.message : error || ''
  ).toLowerCase();
  return /cancel|cancell|dismiss|did not share|sharing.*not available|user did not/i.test(
    message
  );
}

function cacheDirUri() {
  const fromPaths = Paths.cache?.uri;
  if (fromPaths) return fromPaths.endsWith('/') ? fromPaths : `${fromPaths}/`;
  const legacy = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  return legacy;
}

async function ensureLegacyDir(path: string) {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // exists
  }
}

function uniqueName(fileName?: string) {
  return `${Date.now()}-${sanitizeDownloadFileName(fileName)}`;
}

async function writeDataUrlWithNewApi(url: string, fileName: string) {
  const dir = new Directory(Paths.cache, 'feedecho-downloads');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, uniqueName(fileName));
  dest.create({ intermediates: true, overwrite: true });
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('Could not read file');
  const header = url.slice(0, comma);
  const rawPayload = url.slice(comma + 1);
  const encoding = /;base64/i.test(header) ? EncodingType.Base64 : EncodingType.UTF8;
  const payload = encoding === EncodingType.Base64 ? rawPayload.replace(/\s/g, '') : rawPayload;
  await dest.write(payload, { encoding });
  return dest.uri;
}

async function writeDataUrlLegacy(url: string, fileName: string) {
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('Could not read file');
  const header = url.slice(0, comma);
  const rawPayload = url.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const destDir = `${cacheDirUri()}feedecho-downloads/`;
  await ensureLegacyDir(destDir);
  const dest = `${destDir}${uniqueName(fileName)}`;
  await FileSystem.writeAsStringAsync(dest, isBase64 ? rawPayload.replace(/\s/g, '') : rawPayload, {
    encoding: isBase64 ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });
  return dest;
}

async function downloadHttpWithNewApi(url: string, fileName: string) {
  const dir = new Directory(Paths.cache, 'feedecho-downloads');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, uniqueName(fileName));
  const downloaded = await File.downloadFileAsync(url, dest, { idempotent: true });
  return downloaded?.uri || dest.uri;
}

async function downloadHttpLegacy(url: string, fileName: string) {
  const destDir = `${cacheDirUri()}feedecho-downloads/`;
  await ensureLegacyDir(destDir);
  const dest = `${destDir}${uniqueName(fileName)}`;
  const result = await FileSystem.downloadAsync(url, dest);
  if (!result?.uri) throw new Error('Download failed');
  return result.uri;
}

export async function downloadToCacheFile(url: string, fileName?: string) {
  const resolved = resolveFileDownloadUrl(url);
  if (!resolved || resolved === '#') {
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  }
  return materializeLocalUri(resolved, fileName || 'download');
}

export async function deleteDownloadedCacheFile(uri?: string | null) {
  const path = String(uri || '');
  if (!path) return;
  if (path.startsWith('content://') || path.startsWith('ph://') || path.startsWith('assets-library://')) {
    return;
  }
  if (!path.startsWith('file://') && !path.includes('feedecho-downloads')) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // ignore
  }
}

async function materializeLocalUri(url: string, fileName: string) {
  if (url.startsWith('data:')) {
    try {
      return await writeDataUrlWithNewApi(url, fileName);
    } catch {
      return await writeDataUrlLegacy(url, fileName);
    }
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      return await downloadHttpWithNewApi(url, fileName);
    } catch {
      return await downloadHttpLegacy(url, fileName);
    }
  }
  if (url.startsWith('file://') || url.startsWith('content://')) {
    return url;
  }
  throw new Error(DOWNLOAD_FAILED_MESSAGE);
}

async function previewLocalFile(localUri: string, fileName: string, mimeType: string) {
  const file = new File(localUri);
  if (typeof file.canPreview !== 'function' || typeof file.preview !== 'function') {
    return false;
  }
  const can = await file.canPreview({ mimeType });
  if (!can) return false;
  await file.preview({ mimeType, title: fileName });
  return true;
}

async function shareLocalFile(localUri: string, fileName: string, mimeType: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(localUri, {
    mimeType: mimeType || 'application/octet-stream',
    dialogTitle: fileName || 'Download',
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });
  return true;
}

/**
 * Download a remote, data-URL, or local file into app cache, then open the
 * system preview or share sheet. Works in Expo Go (cannot write to public
 * Downloads; the share sheet lets the user save/open the file).
 */
export async function downloadAndOpenFile(
  url: string | null | undefined,
  fileName?: string,
  mimeType?: string
) {
  const resolved = resolveFileDownloadUrl(url);
  if (!resolved || resolved === '#') {
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  }
  const name = fileName || 'download';
  const mime = guessFileMime(name, mimeType);

  try {
    const localUri = await materializeLocalUri(resolved, name);
    try {
      const previewed = await previewLocalFile(localUri, name, mime);
      if (previewed) return;
    } catch (error) {
      if (isUserCancel(error)) return;
    }
    try {
      const shared = await shareLocalFile(localUri, name, mime);
      if (shared) return;
    } catch (error) {
      if (isUserCancel(error)) return;
      throw error;
    }
    if (/^https?:\/\//i.test(resolved)) {
      await Linking.openURL(resolved);
      return;
    }
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  } catch (error) {
    if (isUserCancel(error)) return;
    if (error instanceof Error && error.message === DOWNLOAD_FAILED_MESSAGE) throw error;
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  }
}

/** Same helper; kept for team-chat call sites that pass an object. */
export async function openChatAttachment(input: {
  url?: string | null;
  fileName?: string;
  mimeType?: string;
}) {
  const url = resolveFileDownloadUrl(input);
  return downloadAndOpenFile(url, input.fileName, input.mimeType);
}
