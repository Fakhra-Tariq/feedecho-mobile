import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const TARGET_BYTES = 1024 * 1024;
const MAX_EDGE = 1280;

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
 * Keep the picker URI. DocumentPicker already copies into the app cache when
 * copyToCacheDirectory is true. An extra copyAsync on Android content:// URIs
 * is rejected in Expo SDK 58 ("Call to function ... has been rejected") and
 * Expo Go surfaces that console.error as a red toast.
 */
export async function cacheLocalFileForUpload(input: PreparedChatFile): Promise<PreparedChatFile> {
  const fileName = input.fileName || 'file';
  const mimeType = guessDocumentMime(fileName, input.mimeType);
  const uri = String(input.uri || '');
  if (!uri) return { ...input, fileName, mimeType };
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return {
      ...input,
      uri,
      fileName,
      mimeType,
      size: fileSizeOf(info, input.size || 0),
    };
  } catch {
    return { ...input, uri, fileName, mimeType };
  }
}

export type PreparedChatFile = {
  uri: string;
  mimeType: string;
  fileName: string;
  size?: number;
};

/**
 * Compress for RN upload (data URL in the same POST body as Web).
 * GIFs are left as-is. Everything else is JPEG, long edge 1280, quality ~0.7,
 * target under 1MB so a 12MP camera capture cannot OOM the JS heap.
 */
export async function prepareChatImage(
  input: PreparedChatFile & { width?: number; height?: number }
): Promise<PreparedChatFile> {
  const name = input.fileName || 'photo.jpg';
  const type = String(input.mimeType || '').toLowerCase();
  const isGif = type === 'image/gif' || /\.gif$/i.test(name);
  const cached = await cacheLocalFileForUpload(input);
  if (isGif) return cached;

  let width = input.width || 0;
  let height = input.height || 0;
  const sourceUri = cached.uri;
  const longestKnown = Math.max(width, height);
  const firstActions =
    longestKnown > MAX_EDGE
      ? [
          {
            resize: {
              width: Math.max(1, Math.round(width * (MAX_EDGE / longestKnown))),
              height: Math.max(1, Math.round(height * (MAX_EDGE / longestKnown))),
            },
          },
        ]
      : longestKnown > 0
        ? []
        : [{ resize: { width: MAX_EDGE } }];

  let result = await manipulateAsync(sourceUri, firstActions, {
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  if (Math.max(result.width || 0, result.height || 0) > MAX_EDGE) {
    const long = Math.max(result.width, result.height);
    const ratio = MAX_EDGE / long;
    result = await manipulateAsync(
      result.uri,
      [
        {
          resize: {
            width: Math.max(1, Math.round(result.width * ratio)),
            height: Math.max(1, Math.round(result.height * ratio)),
          },
        },
      ],
      { compress: 0.7, format: SaveFormat.JPEG }
    );
  }
  let quality = 0.7;
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

export async function fileToDataUrl(
  uri: string,
  mimeType: string,
  onProgress?: (ratio: number) => void,
  options?: { maxBytes?: number; tooLargeMessage?: string }
) {
  onProgress?.(0.05);
  const mime = mimeType || 'application/octet-stream';
  const maxBytes = options?.maxBytes;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const size = fileSizeOf(info);
    if (maxBytes != null && size > maxBytes) {
      throw new Error(options?.tooLargeMessage || 'File too large. Maximum size is 100MB for chat.');
    }
  } catch (error) {
    if (error instanceof Error && /too large/i.test(error.message)) throw error;
  }

  try {
    onProgress?.(0.2);
    const blob = await xhrBlob(uri);
    if (!blob || (typeof blob.size === 'number' && blob.size === 0)) {
      throw new Error('Failed to read file');
    }
    if (maxBytes != null && blob.size > maxBytes) {
      throw new Error(options?.tooLargeMessage || 'File too large. Maximum size is 100MB for chat.');
    }
    const dataUrl = await blobToDataUrl(blob, mime);
    onProgress?.(1);
    return dataUrl;
  } catch (blobError) {
    if (blobError instanceof Error && /too large/i.test(blobError.message)) throw blobError;
    const encoding = FileSystem.EncodingType?.Base64 ?? 'base64';
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding });
    if (!base64) throw new Error('Failed to read file');
    onProgress?.(1);
    return `data:${mime};base64,${base64}`;
  }
}
