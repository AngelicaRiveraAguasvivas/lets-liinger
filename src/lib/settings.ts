import { supabase } from '../supabaseClient';

export interface NotificationPrefs {
  paused: boolean;
  messages: boolean;
  follows: boolean;
  engagement: boolean;
  new_events: boolean;
  email: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  paused: false, messages: true, follows: true, engagement: true, new_events: true, email: true,
};

const COLS = 'notif_paused, notif_messages, notif_follows, notif_engagement, notif_new_events, notif_email';

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const { data } = await supabase.from('profiles').select(COLS).eq('id', userId).single();
  const d = (data ?? {}) as any;
  return {
    paused: d.notif_paused ?? false,
    messages: d.notif_messages ?? true,
    follows: d.notif_follows ?? true,
    engagement: d.notif_engagement ?? true,
    new_events: d.notif_new_events ?? true,
    email: d.notif_email ?? true,
  };
}

const PREF_COLUMN: Record<keyof NotificationPrefs, string> = {
  paused: 'notif_paused', messages: 'notif_messages', follows: 'notif_follows',
  engagement: 'notif_engagement', new_events: 'notif_new_events', email: 'notif_email',
};

export async function setNotificationPref(userId: string, key: keyof NotificationPrefs, value: boolean): Promise<void> {
  await supabase.from('profiles').update({ [PREF_COLUMN[key]]: value }).eq('id', userId);
}

// ---- Account privacy -----------------------------------------------------
export async function getPrivacy(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_private').eq('id', userId).single();
  return !!(data as any)?.is_private;
}

export async function setPrivacy(userId: string, isPrivate: boolean): Promise<void> {
  await supabase.from('profiles').update({ is_private: isPrivate }).eq('id', userId);
}

// ---- Blocked accounts ----------------------------------------------------
export interface BlockedProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export async function getBlockedProfiles(userId: string): Promise<BlockedProfile[]> {
  const { data } = await supabase
    .from('blocks')
    .select('blocked:profiles!blocks_blocked_id_fkey(id, username, display_name, avatar_url)')
    .eq('blocker_id', userId);
  return ((data ?? []) as any[]).map((r) => r.blocked).filter(Boolean);
}
