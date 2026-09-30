import { supabase } from '../supabaseClient';

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

// Search people by username or display name (case-insensitive), excluding self.
export async function searchProfiles(query: string, selfId: string | null): Promise<PublicProfile[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const like = `%${q}%`;
  let req = supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .or(`username.ilike.${like},display_name.ilike.${like}`)
    .eq('shadow_banned', false)
    .limit(30);
  if (selfId) req = req.neq('id', selfId);
  const { data } = await req;
  return (data ?? []) as PublicProfile[];
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
    supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
  ]);
  return { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  return !!data;
}

export async function followUser(followerId: string, followingId: string): Promise<void> {
  await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId });
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId);
}

// The set of profile ids the current user already follows (to badge "Following").
export async function getFollowingIds(followerId: string): Promise<Set<string>> {
  const { data } = await supabase.from('follows').select('following_id').eq('follower_id', followerId);
  return new Set((data ?? []).map((r: any) => r.following_id));
}

export interface FollowNotification {
  profile: PublicProfile;
  createdAt: string;
  followsBack: boolean;
}

// People who follow me (newest first) = the "started following you" feed.
export async function getFollowerNotifications(userId: string): Promise<FollowNotification[]> {
  const [{ data: rows }, followingIds] = await Promise.all([
    supabase
      .from('follows')
      .select('created_at, profile:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, bio)')
      .eq('following_id', userId)
      .order('created_at', { ascending: false }),
    getFollowingIds(userId),
  ]);
  return (rows ?? [])
    .filter((r: any) => r.profile)
    .map((r: any) => ({ profile: r.profile, createdAt: r.created_at, followsBack: followingIds.has(r.profile.id) }));
}

export async function getNotificationsSeenAt(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('notifications_seen_at').eq('id', userId).single();
  return (data as any)?.notifications_seen_at ?? null;
}

export async function getUnreadFollowerCount(userId: string): Promise<number> {
  const seenAt = await getNotificationsSeenAt(userId);
  let req = supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', userId);
  if (seenAt) req = req.gt('created_at', seenAt);
  const { count } = await req;
  return count ?? 0;
}

export async function markNotificationsSeen(userId: string): Promise<void> {
  await supabase.from('profiles').update({ notifications_seen_at: new Date().toISOString() }).eq('id', userId);
}

// People I follow who also follow `targetId` — "followed by @x and N others".
export async function getMutualFollowers(myId: string, targetId: string): Promise<{ names: string[]; count: number }> {
  const followingIds = await getFollowingIds(myId);
  if (followingIds.size === 0) return { names: [], count: 0 };
  const { data } = await supabase
    .from('follows')
    .select('profile:profiles!follows_follower_id_fkey(username, display_name)')
    .eq('following_id', targetId)
    .in('follower_id', Array.from(followingIds));
  const rows = data ?? [];
  const names = rows
    .map((r: any) => (r.profile?.username ? `@${r.profile.username}` : r.profile?.display_name))
    .filter(Boolean) as string[];
  return { names, count: names.length };
}

export interface Suggestion extends PublicProfile {
  mutualCount: number;
}

// "People you may know" ranked by MUTUAL follows (friends of the people you
// already follow), same-school first. Excludes self, people you follow, and
// blocked users server-side. `exclude` drops anyone you've just followed this
// session so the list updates without a refetch.
export async function getPeopleYouMayKnow(
  exclude: Set<string>,
  limit = 12
): Promise<Suggestion[]> {
  const { data, error } = await supabase.rpc('suggested_profiles', { lim: limit });
  if (error || !data) return [];
  return (data as any[])
    .filter((r) => !exclude.has(r.id))
    .map((r) => ({
      id: r.id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      bio: r.bio,
      mutualCount: Number(r.mutual_count) || 0,
    }));
}

// "People you may know": profiles sharing at least one interest with me,
// excluding myself, people I already follow, and blocked users.
export async function getSuggestions(
  myId: string,
  myInterests: string[],
  exclude: Set<string>
): Promise<PublicProfile[]> {
  if (!myInterests || myInterests.length === 0) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .overlaps('interests', myInterests)
    .neq('id', myId)
    .limit(30);
  return ((data ?? []) as PublicProfile[]).filter((p) => !exclude.has(p.id)).slice(0, 10);
}

// People who follow `userId`, or people `userId` follows.
export async function getConnections(userId: string, type: 'followers' | 'following'): Promise<PublicProfile[]> {
  if (type === 'followers') {
    const { data } = await supabase
      .from('follows')
      .select('profile:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, bio)')
      .eq('following_id', userId);
    return (data ?? []).map((r: any) => r.profile).filter(Boolean) as PublicProfile[];
  }
  const { data } = await supabase
    .from('follows')
    .select('profile:profiles!follows_following_id_fkey(id, username, display_name, avatar_url, bio)')
    .eq('follower_id', userId);
  return (data ?? []).map((r: any) => r.profile).filter(Boolean) as PublicProfile[];
}
