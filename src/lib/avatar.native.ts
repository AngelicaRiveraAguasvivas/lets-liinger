import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../supabaseClient';

// Native (iOS / Android) image picking + cropping via expo-image-picker.
// Metro loads this file instead of avatar.ts on native builds; the web build
// keeps using avatar.ts (its DOM cropper). Both export the same names so the
// screens that import '../lib/avatar' work unchanged on every platform.

export type AvatarSource = 'library' | 'camera';

// What the native picker hands back — mirrors the web File the rest of the app
// passes to uploadAvatar / uploadEventCover.
export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

function aspectPair(aspect: number): [number, number] {
  return Math.abs(aspect - 1) < 0.01 ? [1, 1] : [16, 9];
}

// Pick from the library (or shoot with the camera) and let the OS crop to
// `aspect` (1 = square avatar, ~1.78 = 16:9 cover). Returns null if the user
// cancels or denies permission.
export async function pickAndCropImage(source: AvatarSource, aspect = 1): Promise<PickedImage | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: aspectPair(aspect),
    quality: 0.9,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const type = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `img_${Date.now()}.${type.includes('png') ? 'png' : 'jpg'}`;
  return { uri: asset.uri, name, type };
}

export function pickAndCropAvatar(source: AvatarSource): Promise<PickedImage | null> {
  return pickAndCropImage(source, 1);
}

// --- Uploads --------------------------------------------------------------
// On native the picker gives a file:// URI, so we read the bytes and upload
// the ArrayBuffer (works in Expo/React Native where Blob support is spotty).
async function uploadImage(bucket: string, path: string, file: PickedImage): Promise<string | null> {
  try {
    const res = await fetch(file.uri);
    const bytes = await res.arrayBuffer();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (error) return null;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}

export async function uploadAvatar(userId: string, file: PickedImage): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  return uploadImage('avatars', `${userId}/avatar_${Date.now()}.${ext}`, file);
}

export async function uploadEventCover(userId: string, file: PickedImage): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  return uploadImage('event-covers', `${userId}/cover_${Date.now()}.${ext}`, file);
}
