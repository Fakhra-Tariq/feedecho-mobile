import * as FileSystem from 'expo-file-system/legacy';
import { Linking } from 'react-native';

import { auth } from '../../firebaseConfig';
import type { ChatMessage } from '@/lib/anonymousChat';
import { downloadAndOpenFile, sanitizeDownloadFileName } from '@/lib/downloadAndOpenFile';
import { API_BASE_URL, ApiError, apiRequest } from '@/lib/api';

export type LiveChatResourceKind = 'file' | 'image' | 'link';

export type LiveChatResourceRecord = {
  id: string;
  source?: string;
  type?: string;
  fileName?: string;
  linkTitle?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  sharedAt?: string;
  chatId?: string;
  chatName?: string;
  linkDomain?: string;
  storagePath?: string | null;
};

export type LiveChatResourceGroup = {
  chatId: string;
  chatName?: string;
  joinCode?: string;
  joinedAt?: string;
  resources: LiveChatResourceRecord[];
};

export function downloadErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Log in to download';
    if (error.status === 403) return 'You do not have access to this file';
    if (error.status === 0) return 'Network error. Try again.';
    return error.message || 'Download failed';
  }
  const message = error instanceof Error ? error.message : '';
  if (/network|failed to fetch|timeout/i.test(message)) return 'Network error. Try again.';
  return message || 'Download failed';
}

export function parseSafeHttpUrl(raw?: string | null) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false as const, error: 'Enter a link.' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false as const, error: 'That is not a valid link.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false as const, error: 'Only http and https links are allowed.' };
  }
  return { ok: true as const, href: parsed.toString(), domain: parsed.hostname.replace(/^www\./i, '') };
}

export async function openSafeHttpUrl(raw?: string | null) {
  const parsed = parseSafeHttpUrl(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  const supported = await Linking.canOpenURL(parsed.href);
  if (!supported) throw new Error('Could not open that link.');
  await Linking.openURL(parsed.href);
}

export async function uploadChatResourceFile(
  chatId: string,
  file: { uri: string; name: string; type?: string },
  onUploadProgress?: (loaded: number, total: number) => void
) {
  const form = new FormData();
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type || 'application/octet-stream',
  } as any);
  return apiRequest<{ success: boolean; data?: unknown; error?: string }>(
    `/anonymous-chats/${encodeURIComponent(chatId)}/resources`,
    { method: 'POST', body: form, onUploadProgress }
  );
}

export async function shareChatResourceLink(chatId: string, url: string, title?: string) {
  return apiRequest<{ success: boolean; data?: unknown; error?: string }>(
    `/anonymous-chats/${encodeURIComponent(chatId)}/resources/link`,
    { method: 'POST', body: { url, title } }
  );
}

export async function listHostChatResources(chatId: string) {
  const response = await apiRequest<{ success?: boolean; data?: LiveChatResourceRecord[] }>(
    `/anonymous-chats/${encodeURIComponent(chatId)}/resources`
  );
  return response.data || [];
}

export async function listMyLiveChatResources() {
  const response = await apiRequest<{ success?: boolean; data?: LiveChatResourceGroup[] }>(
    '/anonymous-chats/my-resources'
  );
  return response.data || [];
}

async function ensureCacheDir() {
  const dir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory || ''}feedecho-downloads/`;
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // exists
  }
  return dir;
}

export async function downloadLiveChatFileToCache(
  chatId: string,
  resourceId: string,
  fileName?: string
) {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Log in to download', 401);
  const token = await user.getIdToken();
  const dir = await ensureCacheDir();
  const dest = `${dir}${Date.now()}-${sanitizeDownloadFileName(fileName)}`;
  const path = `/anonymous-chats/${encodeURIComponent(chatId)}/resources/${encodeURIComponent(resourceId)}/download`;
  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, dest, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError('Network error. Try again.', 0);
  }
  if (result.status === 401) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new ApiError('Log in to download', 401);
  }
  if (result.status === 403) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new ApiError('You do not have access to this file', 403);
  }
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
    throw new ApiError('Download failed', result.status);
  }
  return result.uri;
}

export async function openChatResource(chatId: string, message: ChatMessage) {
  if (message.resourceKind === 'link') {
    await openSafeHttpUrl(message.linkUrl);
    return;
  }
  if (!message.resourceId) throw new Error('Download failed');
  const uri = await downloadLiveChatFileToCache(chatId, message.resourceId, message.fileName);
  await downloadAndOpenFile(uri, message.fileName, message.mimeType);
}
