import { supabase } from '../supabaseClient';

// Per-event engagement stats for the events a user has posted.
export interface EventStat {
  id: string;
  title: string;
  eventTime: string | null;
  host: string | null;      // hosting club/org (free text), null = personal
  category: string | null;
  rsvps: number;
  likes: number;
  comments: number;
  engagement: number;
}

// Aggregated engagement for one club/org the user posts under.
export interface ClubStat {
  name: string;
  events: number;
  rsvps: number;
  likes: number;
  comments: number;
  engagement: number;
  eventIds: string[];
}

export interface CategoryStat {
  key: string; // '' = uncategorized
  events: number;
  rsvps: number;
  likes: number;
  comments: number;
}

// Who is engaging with the user's events (unique people across RSVP/like/comment).
export interface AudienceBreakdown {
  total: number;
  schools: { name: string; count: number; pct: number }[];
  years: { year: string; count: number }[];
  interests: { tag: string; count: number }[];
}

export interface CreatorInsights {
  totalEvents: number;
  totalRsvps: number;
  totalLikes: number;
  totalComments: number;
  totalEngagement: number;
  avgRsvps: number;
  topEvent: EventStat | null;
  events: EventStat[];      // all the user's events, sorted by engagement
  byClub: ClubStat[];       // grouped by hosting org, sorted by engagement
  byCategory: CategoryStat[];
  audience: AudienceBreakdown;
}

// Weighting: an RSVP (someone committing to show up) is worth the most,
// a comment (active discussion) next, a like the least.
export function engagementScore(rsvps: number, likes: number, comments: number): number {
  return rsvps * 3 + comments * 2 + likes;
}

function countByEvent(rows: { event_id: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.event_id] = (map[r.event_id] ?? 0) + 1;
  return map;
}

const EMPTY_AUDIENCE: AudienceBreakdown = { total: 0, schools: [], years: [], interests: [] };

const EMPTY: CreatorInsights = {
  totalEvents: 0, totalRsvps: 0, totalLikes: 0, totalComments: 0, totalEngagement: 0,
  avgRsvps: 0, topEvent: null, events: [], byClub: [], byCategory: [], audience: EMPTY_AUDIENCE,
};

const PERSONAL = 'Personal';

export async function fetchCreatorInsights(userId: string): Promise<CreatorInsights> {
  const { data: events } = await supabase
    .from('events')
    .select('id, title, event_time, host, category')
    .eq('created_by', userId);

  const rows = events ?? [];
  if (rows.length === 0) return EMPTY;

  const ids = rows.map((e: any) => e.id);

  const [rsvpsRes, likesRes, commentsRes] = await Promise.all([
    supabase.from('rsvps').select('event_id, user_id').in('event_id', ids),
    supabase.from('event_likes').select('event_id, user_id').in('event_id', ids),
    supabase.from('event_comments').select('event_id, user_id').in('event_id', ids),
  ]);

  const rsvpRows = rsvpsRes.data ?? [];
  const likeRows = likesRes.data ?? [];
  const commentRows = commentsRes.data ?? [];

  const rsvpCounts = countByEvent(rsvpRows);
  const likeCounts = countByEvent(likeRows);
  const commentCounts = countByEvent(commentRows);

  const stats: EventStat[] = rows.map((e: any) => {
    const rsvps = rsvpCounts[e.id] ?? 0;
    const likes = likeCounts[e.id] ?? 0;
    const comments = commentCounts[e.id] ?? 0;
    return {
      id: e.id,
      title: e.title,
      eventTime: e.event_time,
      host: e.host?.trim() ? e.host.trim() : null,
      category: e.category ?? null,
      rsvps, likes, comments,
      engagement: engagementScore(rsvps, likes, comments),
    };
  });

  stats.sort((a, b) => b.engagement - a.engagement);

  const totalRsvps = stats.reduce((s, e) => s + e.rsvps, 0);
  const totalLikes = stats.reduce((s, e) => s + e.likes, 0);
  const totalComments = stats.reduce((s, e) => s + e.comments, 0);
  const topEvent = stats.reduce<EventStat | null>(
    (top, e) => (top === null || e.rsvps > top.rsvps ? e : top),
    null
  );

  // ---- Group by club/org ----
  const clubMap = new Map<string, ClubStat>();
  for (const e of stats) {
    const name = e.host ?? PERSONAL;
    const c = clubMap.get(name) ?? { name, events: 0, rsvps: 0, likes: 0, comments: 0, engagement: 0, eventIds: [] };
    c.events += 1; c.rsvps += e.rsvps; c.likes += e.likes; c.comments += e.comments;
    c.engagement += e.engagement; c.eventIds.push(e.id);
    clubMap.set(name, c);
  }
  const byClub = [...clubMap.values()].sort((a, b) => b.engagement - a.engagement);

  // ---- Group by category ----
  const catMap = new Map<string, CategoryStat>();
  for (const e of stats) {
    const key = e.category ?? '';
    const c = catMap.get(key) ?? { key, events: 0, rsvps: 0, likes: 0, comments: 0 };
    c.events += 1; c.rsvps += e.rsvps; c.likes += e.likes; c.comments += e.comments;
    catMap.set(key, c);
  }
  const byCategory = [...catMap.values()].sort((a, b) => (b.rsvps + b.likes + b.comments) - (a.rsvps + a.likes + a.comments));

  // ---- Audience: unique people who engaged ----
  const engagerIds = new Set<string>();
  for (const r of [...rsvpRows, ...likeRows, ...commentRows] as any[]) {
    if (r.user_id && r.user_id !== userId) engagerIds.add(r.user_id);
  }
  const audience = await buildAudience([...engagerIds]);

  return {
    totalEvents: stats.length,
    totalRsvps, totalLikes, totalComments,
    totalEngagement: stats.reduce((s, e) => s + e.engagement, 0),
    avgRsvps: stats.length ? Math.round((totalRsvps / stats.length) * 10) / 10 : 0,
    topEvent,
    events: stats,
    byClub,
    byCategory,
    audience,
  };
}

async function buildAudience(ids: string[]): Promise<AudienceBreakdown> {
  if (ids.length === 0) return EMPTY_AUDIENCE;
  const { data } = await supabase
    .from('profiles')
    .select('university, grad_year, interests')
    .in('id', ids);
  const people = (data ?? []) as { university: string | null; grad_year: string | null; interests: string[] | null }[];

  const tally = (arr: (string | null | undefined)[]) => {
    const m = new Map<string, number>();
    for (const v of arr) { const k = (v ?? '').trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };

  const schoolMap = tally(people.map((p) => p.university));
  const schoolTotal = [...schoolMap.values()].reduce((s, n) => s + n, 0) || 1;
  const schools = [...schoolMap.entries()]
    .map(([name, count]) => ({ name, count, pct: Math.round((count / schoolTotal) * 100) }))
    .sort((a, b) => b.count - a.count).slice(0, 4);

  const yearMap = tally(people.map((p) => p.grad_year));
  const years = [...yearMap.entries()].map(([year, count]) => ({ year, count })).sort((a, b) => b.count - a.count).slice(0, 3);

  const interestMap = tally(people.flatMap((p) => p.interests ?? []));
  const interests = [...interestMap.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  return { total: people.length, schools, years, interests };
}
