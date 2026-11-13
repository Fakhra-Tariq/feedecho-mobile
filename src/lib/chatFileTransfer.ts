import * as DocumentPicker from 'expo-document-picker';

import { guessDocumentMime } from '@/lib/compressChatImage';
export {
  downloadAndOpenFile,
  DOWNLOAD_FAILED_MESSAGE,
  openChatAttachment,
} from '@/lib/downloadAndOpenFile';

const DOCUMENT_EXT = /\.(pdf|doc|docx|txt|ppt|pptx|xls|xlsx)$/i;
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const DOCUMENT_PICKER_TYPES = [...DOCUMENT_TYPES];

export const MAX_CHAT_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function isAllowedChatDocument(name?: string, mime?: string) {
  const type = String(mime || '').toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/')) return false;
  return DOCUMENT_TYPES.has(type) || DOCUMENT_EXT.test(name || '');
}

export function formatChatFileSize(bytes?: number | null) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function estimateDataUrlBytes(url?: string) {
  const text = String(url || '');
  if (!text.startsWith('data:') || !text.includes(',')) return 0;
  const base64 = text.slice(text.indexOf(',') + 1);
  return Math.max(0, Math.floor((base64.length * 3) / 4));
}

export function sanitizeChatFileName(name?: string) {
  const raw = String(name || 'download').trim() || 'download';
  const extMatch = raw.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const base = (extMatch ? raw.slice(0, -ext.length) : raw)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return `${base || 'file'}${ext}`;
}

export type PickedChatDocument = {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number;
};

export type PickChatDocumentResult =
  | { status: 'canceled' }
  | { status: 'invalid'; message: string }
  | { status: 'oversized'; message: string }
  | { status: 'error'; message: string }
  | { status: 'picked'; asset: PickedChatDocument };

/**
 * Pick one document for team chat. Relies on DocumentPicker copyToCacheDirectory
 * (no extra FileSystem.copyAsync — that rejects on Android content:// in Expo SDK 58).
 */
export async function pickTeamChatDocument(): Promise<PickChatDocumentResult> {
  try {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
    }
    if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };
    const asset = result.assets[0];
    const fileName = asset.name || 'file';
    const mimeType = guessDocumentMime(fileName, asset.mimeType);
    if (String(mimeType).startsWith('image/') || String(mimeType).startsWith('video/')) {
      return { status: 'invalid', message: 'Please choose a document.' };
    }
    if (!isAllowedChatDocument(fileName, mimeType)) {
      return {
        status: 'invalid',
        message: 'Please choose a supported document (pdf, doc, docx, txt, ppt, pptx, xls, xlsx).',
      };
    }
    const size = typeof asset.size === 'number' ? asset.size : undefined;
    if (size && size > MAX_CHAT_ATTACHMENT_BYTES) {
      return {
        status: 'oversized',
        message: 'File too large. Maximum size is 100MB for chat.',
      };
    }
    return {
      status: 'picked',
      asset: {
        uri: asset.uri,
        fileName,
        mimeType,
        size,
      },
    };
  } catch {
    return { status: 'error', message: 'Could not open the file picker.' };
  }
}

