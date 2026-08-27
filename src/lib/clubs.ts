import { supabase } from '../supabaseClient';

export interface Club {
  id: string;
  name: string;
  emoji: string | null;
}

export function clubLabel(c: Club): string {
  return c.emoji ? `${c.emoji} ${c.name}` : c.name;
}

export async function fetchClubs(): Promise<Club[]> {
  const { data } = await supabase.from('clubs').select('id, name, emoji').order('name');
  return (data as Club[]) ?? [];
}

// Fetch a single club by name (for its profile page). Clubs are referenced by
// name across the app (events.host is free text), so name is the key.
export async function fetchClubByName(name: string): Promise<Club | null> {
  const { data } = await supabase.from('clubs').select('id, name, emoji').ilike('name', name).limit(1).maybeSingle();
  return (data as Club) ?? null;
}

// ---- Following clubs -----------------------------------------------------

export async function getFollowedClubNames(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('club_follows').select('club_name').eq('user_id', userId);
  return new Set((data ?? []).map((r: any) => r.club_name));
}

export async function isFollowingClub(userId: string, clubName: string): Promise<boolean> {
  const { count } = await supabase
    .from('club_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('club_name', clubName);
  return (count ?? 0) > 0;
}

export async function followClub(userId: string, clubName: string): Promise<void> {
  await supabase.from('club_follows').insert({ user_id: userId, club_name: clubName });
}

export async function unfollowClub(userId: string, clubName: string): Promise<void> {
  await supabase.from('club_follows').delete().eq('user_id', userId).eq('club_name', clubName);
}

// Events hosted by a club (matched on the free-text `host` field).
export async function fetchClubEvents(clubName: string): Promise<{ id: string; title: string; location: string | null; event_time: string | null; cover_url: string | null; category: string | null }[]> {
  const { data } = await supabase
    .from('events')
    .select('id, title, location, event_time, cover_url, category')
    .ilike('host', clubName)
    .order('event_time', { ascending: true });
  return (data as any[]) ?? [];
}

// Adds a club to the shared list. If it already exists, returns the existing row.
export async function addClub(name: string, emoji: string): Promise<Club | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('clubs')
    .insert({ name: trimmed, emoji: emoji.trim() || null })
    .select('id, name, emoji')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('clubs')
        .select('id, name, emoji')
        .eq('name', trimmed)
        .single();
      return (existing as Club) ?? null;
    }
    return null;
  }
  return data as Club;
}
