import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  DOWNLOAD_FAILED_MESSAGE,
  deleteDownloadedCacheFile,
  downloadToCacheFile,
  guessFileMime,
} from '@/lib/downloadAndOpenFile';

const SAF_DIR_KEY = 'feedechoAndroidDownloadsDirUri';
const DOWNLOAD_ALBUM = 'Download';

export const SAVE_PERMISSION_MESSAGE =
  'Permission was denied. Allow access so FeedEcho can save this file.';

export type SaveResourceResult =
  | { status: 'saved'; message: string }
  | { status: 'cancelled' };

function isCancel(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return /cancel|cancell|dismiss|did not share|sharing.*not available|user did not/i.test(message);
}

function isImageSave(fileName: string, mimeType: string, resourceType?: string) {
  if (String(resourceType || '').toLowerCase() === 'image') return true;
  if (mimeType.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(fileName);
}

/** Keep the original name and extension; strip only path-illegal characters. */
export function sanitizeSavedFileName(name?: string) {
  const raw = String(name || 'download').trim() || 'download';
  const extMatch = raw.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1] : '';
  const base = (extMatch ? raw.slice(0, -ext.length) : raw)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'file'}${ext}`;
}

function splitFileName(fileName: string) {
  const match = fileName.match(/^(.*?)(\.[A-Za-z0-9]{1,8})$/);
  if (!match) return { base: fileName || 'file', ext: '' };
  return { base: match[1] || 'file', ext: match[2] };
}

function uniqueFileName(desired: string, existingLower: Set<string>) {
  if (!existingLower.has(desired.toLowerCase())) return desired;
  const { base, ext } = splitFileName(desired);
  let n = 1;
  let next = `${base} (${n})${ext}`;
  while (existingLower.has(next.toLowerCase())) {
    n += 1;
    next = `${base} (${n})${ext}`;
  }
  return next;
}

function nameFromSafUri(uri: string) {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split('/').pop() || decoded;
    const afterColon = tail.includes(':') ? tail.slice(tail.lastIndexOf(':') + 1) : tail;
    return (afterColon.split('/').pop() || afterColon).trim();
  } catch {
    return '';
  }
}

async function ensureAndroidDownloadsDir() {
  const stored = (await AsyncStorage.getItem(SAF_DIR_KEY))?.trim();
  if (stored) {
    try {
      await FileSystem.StorageAccessFramework.readDirectoryAsync(stored);
      return stored;
    } catch {
      await AsyncStorage.removeItem(SAF_DIR_KEY);
    }
  }

  const initial = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
  let permission: { granted: boolean; directoryUri?: string };
  try {
    permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initial);
  } catch {
    permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  }
  if (!permission.granted || !permission.directoryUri) {
    const error = new Error(SAVE_PERMISSION_MESSAGE);
    error.name = 'DownloadPermissionError';
    throw error;
  }
  await AsyncStorage.setItem(SAF_DIR_KEY, permission.directoryUri);
  return permission.directoryUri;
}

async function listSafNames(dirUri: string) {
  const entries = await FileSystem.StorageAccessFramework.readDirectoryAsync(dirUri);
  return new Set(entries.map((item) => nameFromSafUri(item).toLowerCase()).filter(Boolean));
}

async function saveDocumentAndroid(localUri: string, fileName: string, mimeType: string) {
  let dirUri = await ensureAndroidDownloadsDir();
  let existing: Set<string>;
  try {
    existing = await listSafNames(dirUri);
  } catch {
    await AsyncStorage.removeItem(SAF_DIR_KEY);
    dirUri = await ensureAndroidDownloadsDir();
    existing = await listSafNames(dirUri);
  }
  await writeSafFile(dirUri, localUri, uniqueFileName(fileName, existing), mimeType);
}

async function writeSafFile(dirUri: string, localUri: string, fileName: string, mimeType: string) {
  const { base } = splitFileName(fileName);
  const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
    dirUri,
    base,
    mimeType || 'application/octet-stream'
  );
  const payload = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.StorageAccessFramework.writeAsStringAsync(destUri, payload, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function copyToNamedCache(localUri: string, fileName: string) {
  const root = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  if (!root) return localUri;
  const dir = `${root}feedecho-saves/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // exists
  }
  const dest = `${dir}${fileName}`;
  if (dest === localUri) return localUri;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    // ignore
  }
  await FileSystem.copyAsync({ from: localUri, to: dest });
  return dest;
}

async function saveImageToLibrary(localUri: string) {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (permission.status !== 'granted') {
    const error = new Error(SAVE_PERMISSION_MESSAGE);
    error.name = 'DownloadPermissionError';
    throw error;
  }
  const asset = await MediaLibrary.createAssetAsync(localUri);
  try {
    const album = await MediaLibrary.getAlbumAsync(DOWNLOAD_ALBUM);
    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync(DOWNLOAD_ALBUM, asset, false);
    }
  } catch {
    // Gallery save succeeded even if the Download album step fails.
  }
}

async function shareToFiles(localUri: string, fileName: string, mimeType: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  }
  await Sharing.shareAsync(localUri, {
    mimeType: mimeType || 'application/octet-stream',
    dialogTitle: fileName || 'Save file',
    UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
  });
}

/**
 * Save a History resource onto the device. Does not open a viewer.
 */
export async function saveResourceToDevice(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
  resourceType?: string;
}): Promise<SaveResourceResult> {
  const fileName = sanitizeSavedFileName(input.fileName);
  const mimeType = guessFileMime(fileName, input.mimeType);
  const image = isImageSave(fileName, mimeType, input.resourceType);
  let localUri = '';
  let extraCleanupUri = '';

  try {
    localUri = await downloadToCacheFile(input.url, fileName);
    if (image) {
      const namedUri = await copyToNamedCache(localUri, fileName);
      extraCleanupUri = namedUri !== localUri ? namedUri : '';
      await saveImageToLibrary(namedUri);
      return {
        status: 'saved',
        message: Platform.OS === 'ios' ? 'Saved to Photos' : 'Saved to Downloads',
      };
    }
    if (Platform.OS === 'android') {
      await saveDocumentAndroid(localUri, fileName, mimeType);
      return { status: 'saved', message: 'Saved to Downloads' };
    }
    await shareToFiles(localUri, fileName, mimeType);
    return { status: 'saved', message: 'Use Save to Files to keep the document' };
  } catch (error) {
    if (isCancel(error)) return { status: 'cancelled' };
    if (error instanceof Error && error.name === 'DownloadPermissionError') throw error;
    throw new Error(DOWNLOAD_FAILED_MESSAGE);
  } finally {
    await deleteDownloadedCacheFile(localUri);
    if (extraCleanupUri) await deleteDownloadedCacheFile(extraCleanupUri);
  }
}
