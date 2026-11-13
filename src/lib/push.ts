import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '../supabaseClient';

// Foreground behavior for incoming pushes — banner + list entry, no sound.
// Must be set once at module scope (not inside a component) per Expo docs.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId
  );
}

// Turns push notifications ON for a user: asks the OS for permission, fetches
// the Expo push token, and stores it (with push_enabled = true) on the profile.
//
// Real remote push only works in an installed native build (iOS/Android) that
// has EAS credentials configured — not on web and not in Expo Go. Physical
// devices, Android emulators with Google Play services, and iOS simulators
// on Xcode 14+ can all receive it, so we don't gate on Device.isDevice —
// any genuinely unsupported environment will just fail the token fetch below
// with a real error instead of a blanket (and often wrong) guess.
export async function enablePush(userId: string): Promise<{ error?: string }> {
  if (Platform.OS === 'web') {
    return { error: 'Push notifications are only available in the iOS/Android app.' };
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return { error: 'Notifications permission was not granted.' };
  }

  // Android needs a channel for notifications to appear.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = getProjectId();
  if (!projectId) {
    return { error: 'Push isn’t set up yet. Run `eas init` to link a project, then rebuild.' };
  }

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res.data;
  } catch (e) {
    return { error: (e as Error).message ?? 'Could not get a push token.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ push_token: token, push_enabled: true })
    .eq('id', userId);
  if (error) return { error: error.message };
  return {};
}

// Turns push notifications OFF: clears the flag (and token) on the profile.
export async function disablePush(userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_enabled: false, push_token: null })
    .eq('id', userId);
  return error ? { error: error.message } : {};
}

// Current stored preference for the user (used to render the toggle state).
export async function getPushEnabled(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('push_enabled').eq('id', userId).single();
  return !!(data as any)?.push_enabled;
}

// Best-effort refresh of the stored push token on app launch, for users who
// already have push enabled. Expo push tokens can change (reinstall, restore
// from backup, etc.) — silently re-fetching keeps the stored one deliverable
// instead of waiting for the user to notice pushes stopped and re-toggle it.
export async function refreshPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const { data } = await supabase.from('profiles').select('push_enabled').eq('id', userId).single();
  if (!(data as any)?.push_enabled) return;

  const projectId = getProjectId();
  if (!projectId) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch {
    // Best-effort — next enablePush() call or app launch will retry.
  }
}
