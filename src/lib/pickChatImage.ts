import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

import { showAlert } from '@/components/feedback';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

export type PickedChatImage = {
  uri: string;
  fileName: string;
  mimeType: string;
  size?: number;
  width?: number;
  height?: number;
};

export type PickChatImageResult =
  | { status: 'picked'; asset: PickedChatImage }
  | { status: 'canceled' }
  | { status: 'denied'; permission: 'photos' }
  | { status: 'error'; message: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  allowsEditing: false,
  allowsMultipleSelection: false,
  exif: false,
};

function androidApiLevel() {
  if (Platform.OS !== 'android') return 0;
  const version = Platform.Version;
  const n = typeof version === 'number' ? version : Number.parseInt(String(version), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Android 13+ system photo picker does not need the media-library permission. */
function needsMediaLibraryPermission() {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'android') return androidApiLevel() > 0 && androidApiLevel() < 33;
  return true;
}

function assetFromPicker(asset: ImagePicker.ImagePickerAsset): PickedChatImage | null {
  const uri = asset?.uri;
  if (!uri) return null;
  const fileName = asset.fileName || `photo-${Date.now()}.jpg`;
  const mimeType = asset.mimeType || 'image/jpeg';
  if (asset.type === 'video' || String(mimeType).startsWith('video/')) return null;
  if (String(mimeType).toLowerCase() === 'image/svg+xml') return null;
  if (!IMAGE_EXT.test(fileName) && !String(mimeType).startsWith('image/')) return null;
  return {
    uri,
    fileName,
    mimeType,
    size: asset.fileSize,
    width: asset.width,
    height: asset.height,
  };
}

function resultFromPicker(
  result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null
): PickChatImageResult {
  if (!result) return { status: 'canceled' };
  if ('code' in result && result.code) {
    return {
      status: 'error',
      message: String(
        (result as ImagePicker.ImagePickerErrorResult).message || 'Could not open the photo library.'
      ),
    };
  }
  if ('canceled' in result && result.canceled) return { status: 'canceled' };
  const asset = 'assets' in result ? result.assets?.[0] : undefined;
  const mapped = asset ? assetFromPicker(asset) : null;
  if (!mapped) return { status: 'canceled' };
  return { status: 'picked', asset: mapped };
}

export function showMediaPermissionAlert() {
  showAlert({
    type: 'warning',
    title: 'Permission needed',
    message: 'Allow photo library access in Settings to share an image.',
    primary: {
      label: 'Open Settings',
      onPress: () => {
        Linking.openSettings().catch(() => undefined);
      },
    },
    secondary: { label: 'Not now' },
  });
}

/**
 * Opens the system gallery (no camera, no action sheet).
 * Shared by Team Chat and any other image-icon picker.
 */
export async function pickGalleryImage(): Promise<PickChatImageResult> {
  try {
    if (needsMediaLibraryPermission()) {
      const library = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!library.granted) return { status: 'denied', permission: 'photos' };
    }
    const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return resultFromPicker(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not open the photo picker.';
    console.error('Gallery picker failed', error);
    return { status: 'error', message };
  }
}

/** @deprecated Use pickGalleryImage — same gallery-only helper. */
export async function pickTeamChatImage(): Promise<PickChatImageResult> {
  return pickGalleryImage();
}
