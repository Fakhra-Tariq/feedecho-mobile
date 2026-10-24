import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const TARGET_BYTES = 1024 * 1024;
const MAX_EDGE = 1600;

const DOCUMENT_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Web File.type fallback: guess from extension, including uppercase .PDF. */
export function guessDocumentMime(fileName?: string, mimeType?: string) {
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
  return (ext && DOCUMENT_MIME_BY_EXT[ext]) || type || 'application/octet-stream';
}

function fileExtension(fileName?: string) {
  const match = String(fileName || '').match(/(\.[A-Za-z0-9]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function fileSizeOf(info: { exists: boolean; size?: number }, fallback = 0) {
  if (info.exists && typeof info.size === 'number') return info.size;
  return fallback;
}

function xhrBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status >= 400) {
        reject(new Error(`Failed to read file (${xhr.status})`));
        return;
      }
      if (!xhr.response) {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(xhr.response);
    };
    xhr.onerror = () => reject(new Error('Failed to read file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri);
    xhr.send();
  });
}

function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.includes(',')) {
        reject(new Error('Failed to read file'));
        return;
      }
      const base64 = result.slice(result.indexOf(',') + 1);
      if (!base64) {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(`data:${mimeType || blob.type || 'application/octet-stream'};base64,${base64}`);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Copy a picker URI into app cache with an ASCII name so FileSystem can read
 * files like "20260927182115908 (1).PDF" or content:// URIs on Android.
 * Original display name is kept on fileName.
 */
export async function cacheLocalFileForUpload(input: PreparedChatFile): Promise<PreparedChatFile> {
  const fileName = input.fileName || 'file';
  const mimeType = guessDocumentMime(fileName, input.mimeType);
  const destDir = `${FileSystem.cacheDirectory}team-chat-uploads/`;
  try {
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  } catch {
    // directory may already exist
  }
  const dest = `${destDir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${fileExtension(fileName)}`;
  try {
    await FileSystem.copyAsync({ from: input.uri, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) throw new Error('Failed to cache file');
    return {
      uri: dest,
      fileName,
      mimeType,
      size: fileSizeOf(info, input.size || 0),
    };
  } catch (error) {
    console.error('Team chat: cache copy failed', {
      message: error instanceof Error ? error.message : String(error),
      uri: input.uri,
      fileName,
    });
    return { ...input, fileName, mimeType };
  }
}

export type PreparedChatFile = {
  uri: string;
  mimeType: string;
  fileName: string;
  size?: number;
};

/** Same rules as Web prepareChatImage: skip GIFs; JPEG ~0.8; max 1600px; target < 1MB. */
export async function prepareChatImage(
  input: PreparedChatFile & { width?: number; height?: number }
): Promise<PreparedChatFile> {
  const name = input.fileName || 'photo.jpg';
  const type = String(input.mimeType || '').toLowerCase();
  const isGif = type === 'image/gif' || /\.gif$/i.test(name);
  if (isGif) return input;

  const info = await FileSystem.getInfoAsync(input.uri);
  const size = fileSizeOf(info, input.size || 0);
  // Same as Web: skip GIFs (above) and already-small images without recompressing.
  if (size > 0 && size <= TARGET_BYTES) {
    return { ...input, size };
  }

  let width = input.width || 0;
  let height = input.height || 0;
  if (!width || !height) {
    const probe = await manipulateAsync(input.uri, [], { compress: 1, format: SaveFormat.JPEG });
    width = probe.width;
    height = probe.height;
  }

  const longest = Math.max(width, height);
  const actions: { resize: { width: number; height: number } }[] = [];
  if (longest > MAX_EDGE) {
    const ratio = MAX_EDGE / longest;
    actions.push({
      resize: {
        width: Math.max(1, Math.round(width * ratio)),
        height: Math.max(1, Math.round(height * ratio)),
      },
    });
  }

  let result = await manipulateAsync(input.uri, actions, {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  let quality = 0.8;
  let resultInfo = await FileSystem.getInfoAsync(result.uri);
  let resultSize = fileSizeOf(resultInfo);

  while (resultSize > TARGET_BYTES && quality > 0.45) {
    quality = Math.round((quality - 0.1) * 10) / 10;
    result = await manipulateAsync(result.uri, [], {
      compress: quality,
      format: SaveFormat.JPEG,
    });
    resultInfo = await FileSystem.getInfoAsync(result.uri);
    resultSize = fileSizeOf(resultInfo);
  }

  let edge = Math.max(result.width || MAX_EDGE, result.height || MAX_EDGE);
  while (resultSize > TARGET_BYTES && edge > 640) {
    edge = Math.round(edge * 0.85);
    const ratio = edge / Math.max(result.width || edge, result.height || edge);
    result = await manipulateAsync(
      result.uri,
      [
        {
          resize: {
            width: Math.max(1, Math.round((result.width || edge) * ratio)),
            height: Math.max(1, Math.round((result.height || edge) * ratio)),
          },
        },
      ],
      { compress: 0.7, format: SaveFormat.JPEG }
    );
    resultInfo = await FileSystem.getInfoAsync(result.uri);
    resultSize = fileSizeOf(resultInfo);
  }

  const base = String(name).replace(/\.[^.]+$/, '') || 'photo';
  return {
    uri: result.uri,
    mimeType: 'image/jpeg',
    fileName: `${base}.jpg`,
    size: resultSize,
  };
}

export async function fileToDataUrl(uri: string, mimeType: string, onProgress?: (ratio: number) => void) {
  onProgress?.(0.05);
  const mime = mimeType || 'application/octet-stream';
  const encoding = FileSystem.EncodingType?.Base64 ?? 'base64';
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding });
    if (!base64) throw new Error('Failed to read file');
    onProgress?.(1);
    return `data:${mime};base64,${base64}`;
  } catch (fsError) {
    console.error('Team chat: FileSystem read failed, trying XHR blob', {
      message: fsError instanceof Error ? fsError.message : String(fsError),
      uri,
      mimeType: mime,
    });
    const blob = await xhrBlob(uri);
    if (!blob || (typeof blob.size === 'number' && blob.size === 0)) {
      throw new Error('Failed to read file');
    }
    const dataUrl = await blobToDataUrl(blob, mime);
    onProgress?.(1);
    return dataUrl;
  }
}
