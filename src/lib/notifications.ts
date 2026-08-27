import { supabase } from '../supabaseClient';
import type { PublicProfile } from './follows';
import { getFollowerNotifications, getNotificationsSeenAt, getUnreadFollowerCount } from './follows';

// ---- "Last seen" markers (power the tab-bar dots) -----------------------
//
// We reuse the same coarse pattern as notifications_seen_at: a single
// timestamp per user per channel. Unread = rows newer than that timestamp.
// Opening the relevant tab stamps the marker to "now", clearing the dot.

async function getSeen(userId: string, column: 'messages_seen_at' | 'events_seen_at'): Promise<string | null> {
  const { data } = await supabase.from('profiles').select(column).eq('id', userId).single();
  return (data as any)?.[column] ?? null;
}

// Count of DMs I've received since I last opened the inbox.
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const seenAt = await getSeen(userId, 'messages_seen_at');
  let req = supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId);
  if (seenAt) req = req.gt('created_at', seenAt);
  const { count } = await req;
  return count ?? 0;
}

export async function markMessagesSeen(userId: string): Promise<void> {
  await supabase.from('profiles').update({ messages_seen_at: new Date().toISOString() }).eq('id', userId);
}

// Count of events created by other people since I last opened the home feed.
export async function getNewEventCount(userId: string): Promise<number> {
  const seenAt = await getSeen(userId, 'events_seen_at');
  let req = supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .neq('created_by', userId);
  if (seenAt) req = req.gt('created_at', seenAt);
  const { count } = await req;
  return count ?? 0;
}

export async function markEventsSeen(userId: string): Promise<void> {
  await supabase.from('profiles').update({ events_seen_at: new Date().toISOString() }).eq('id', userId);
}

// ---- Unified notifications feed -----------------------------------------

export type EngagementVerb = 'liked' | 'commented on' | 'is going to';

export type NotificationItem =
  | { kind: 'follow'; key: string; createdAt: string; profile: PublicProfile; followsBack: boolean }
  | { kind: 'message'; key: string; createdAt: string; profile: PublicProfile; preview: string }
  | { kind: 'event'; key: string; createdAt: string; profile: PublicProfile | null; eventId: string; title: string }
  | { kind: 'engagement'; key: string; createdAt: string; profile: PublicProfile | null; eventId: string; title: string; verb: EngagementVerb };

const PROFILE_COLS = 'id, username, display_name, avatar_url, bio';

// Likes, comments, and RSVPs other people leave on events I created — the core
// "your event is landing" feedback loop.
async function getEngagementNotifications(userId: string): Promise<NotificationItem[]> {
  const { data: myEvents } = await supabase.from('events').select('id, title').eq('created_by', userId);
  const events = (myEvents ?? []) as { id: string; title: string | null }[];
  if (events.length === 0) return [];
  const ids = events.map((e) => e.id);
  const titleById = new Map(events.map((e) => [e.id, e.title ?? 'your event']));

  const [likesRes, commentsRes, rsvpsRes] = await Promise.all([
    supabase
      .from('event_likes')
      .select(`event_id, created_at, actor:profiles!event_likes_user_id_fkey(${PROFILE_COLS})`)
      .in('event_id', ids).neq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase
      .from('event_comments')
      .select(`event_id, created_at, actor:profiles!event_comments_user_id_fkey(${PROFILE_COLS})`)
      .in('event_id', ids).neq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase
      .from('rsvps')
      .select(`event_id, created_at, actor:profiles!rsvps_user_id_fkey(${PROFILE_COLS})`)
      .in('event_id', ids).neq('user_id', userId).order('created_at', { ascending: false }).limit(20),
  ]);

  const build = (rows: any[], verb: EngagementVerb, tag: string): NotificationItem[] =>
    rows.map((r, i) => ({
      kind: 'engagement' as const,
      key: `${tag}-${r.event_id}-${r.actor?.id ?? i}-${r.created_at}`,
      createdAt: r.created_at,
      profile: r.actor ?? null,
      eventId: r.event_id,
      title: titleById.get(r.event_id) ?? 'your event',
      verb,
    }));

  return [
    ...build(likesRes.data ?? [], 'liked', 'like'),
    ...build(commentsRes.data ?? [], 'commented on', 'cmt'),
    ...build(rsvpsRes.data ?? [], 'is going to', 'rsvp'),
  ];
}

// Most recent DM per sender that I've received (so the feed shows one row per
// person, not every message).
async function getMessageNotifications(userId: string): Promise<NotificationItem[]> {
  const { data } = await supabase
    .from('direct_messages')
    .select('id, content, created_at, sender:profiles!direct_messages_sender_id_fkey(id, username, display_name, avatar_url, bio)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const items: NotificationItem[] = [];
  for (const r of (data ?? []) as any[]) {
    if (!r.sender || seen.has(r.sender.id)) continue;
    seen.add(r.sender.id);
    items.push({
      kind: 'message',
      key: `msg-${r.sender.id}`,
      createdAt: r.created_at,
      profile: r.sender,
      preview: r.content,
    });
  }
  return items;
}

// Recent events created by other people.
async function getEventNotifications(userId: string): Promise<NotificationItem[]> {
  const { data } = await supabase
    .from('events')
    .select('id, title, created_at, creator:profiles!events_created_by_fkey(id, username, display_name, avatar_url, bio)')
    .neq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  return ((data ?? []) as any[]).map((r) => ({
    kind: 'event' as const,
    key: `evt-${r.id}`,
    createdAt: r.created_at,
    profile: r.creator ?? null,
    eventId: r.id,
    title: r.title ?? 'Untitled event',
  }));
}

// Count of likes/comments/RSVPs on my events (by others) since I last opened
// the notifications screen — for the bell's unread badge.
async function getUnreadEngagementCount(userId: string): Promise<number> {
  const seenAt = await getNotificationsSeenAt(userId);
  const { data: myEvents } = await supabase.from('events').select('id').eq('created_by', userId);
  const ids = (myEvents ?? []).map((e: any) => e.id);
  if (ids.length === 0) return 0;

  const countOn = async (table: 'event_likes' | 'event_comments' | 'rsvps') => {
    let req = supabase.from(table).select('event_id', { count: 'exact', head: true }).in('event_id', ids).neq('user_id', userId);
    if (seenAt) req = req.gt('created_at', seenAt);
    const { count } = await req;
    return count ?? 0;
  };

  const [likes, comments, rsvps] = await Promise.all([
    countOn('event_likes'), countOn('event_comments'), countOn('rsvps'),
  ]);
  return likes + comments + rsvps;
}

// Total unread for the notifications bell: new followers + engagement on my
// events, since I last opened the notifications screen.
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [follows, engagement] = await Promise.all([
    getUnreadFollowerCount(userId),
    getUnreadEngagementCount(userId),
  ]);
  return follows + engagement;
}

// Everything, newest first — follows + received messages + new events +
// engagement on my own events.
export async function getAllNotifications(userId: string): Promise<NotificationItem[]> {
  const [follows, messages, events, engagement] = await Promise.all([
    getFollowerNotifications(userId),
    getMessageNotifications(userId),
    getEventNotifications(userId),
    getEngagementNotifications(userId),
  ]);

  const followItems: NotificationItem[] = follows.map((f) => ({
    kind: 'follow',
    key: `fol-${f.profile.id}`,
    createdAt: f.createdAt,
    profile: f.profile,
    followsBack: f.followsBack,
  }));

  return [...followItems, ...messages, ...events, ...engagement].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
