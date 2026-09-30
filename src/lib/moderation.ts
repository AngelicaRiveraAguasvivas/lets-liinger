import { supabase } from '../supabaseClient';

// All user ids the current user has a block relationship with, in EITHER
// direction (people I blocked + people who blocked me). Used to hide those
// users from search, feed, and connection lists.
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  const ids = new Set<string>();
  for (const r of data ?? []) {
    ids.add(r.blocker_id === userId ? r.blocked_id : r.blocker_id);
  }
  return ids;
}

// Just the ids I actively blocked (to show "Unblock" vs "Block").
export async function getMyBlockedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId);
  return new Set((data ?? []).map((r: any) => r.blocked_id));
}

// Blocking also severs any follow relationship in both directions.
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  await supabase
    .from('follows')
    .delete()
    .or(
      `and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`
    );
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await supabase.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
}

// Categorized report reasons. 'hate' / 'violence' / 'nudity' / 'harassment'
// are the "severe" categories that can trigger an auto shadow-ban faster.
export const REPORT_REASONS: { key: string; label: string }[] = [
  { key: 'spam', label: 'Spam or scam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech or symbols' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'nudity', label: 'Nudity or sexual content' },
  { key: 'impersonation', label: 'Fake account / impersonation' },
  { key: 'underage', label: 'Underage user' },
  { key: 'other', label: 'Something else' },
];

export async function reportUser(
  reporterId: string, targetUserId: string, category: string, detail = ''
): Promise<void> {
  await supabase.from('reports').insert({
    reporter_id: reporterId, target_user_id: targetUserId,
    category, detail: detail.trim() || null, reason: detail.trim() || category,
  });
}

export async function reportEvent(
  reporterId: string, targetEventId: string, category: string, detail = ''
): Promise<void> {
  await supabase.from('reports').insert({
    reporter_id: reporterId, target_event_id: targetEventId,
    category, detail: detail.trim() || null, reason: detail.trim() || category,
  });
}

// Moderator action: lift (or re-apply) a shadow ban after reviewing.
export async function setShadowBan(userId: string, value: boolean): Promise<void> {
  await supabase.rpc('set_shadow_ban', { p_user: userId, p_val: value });
}

// ---- Moderator review queue --------------------------------------------

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export type ModerationReport = {
  id: string;
  reason: string | null;
  status: ReportStatus;
  resolution: string | null;
  created_at: string;
  category: string | null;
  detail: string | null;
  reporter: { username: string | null; display_name: string | null } | null;
  targetUser: { id: string; username: string | null; display_name: string | null; shadow_banned?: boolean } | null;
  targetEvent: { id: string; title: string | null } | null;
};

// Whether the given user is a moderator (gates the review dashboard).
export async function isModerator(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_moderator')
    .eq('id', userId)
    .single();
  return !!data?.is_moderator;
}

// Reports for the review queue. Requires moderator RLS to return rows.
export async function fetchReports(status: ReportStatus = 'open'): Promise<ModerationReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      `id, reason, category, detail, status, resolution, created_at,
       reporter:profiles!reports_reporter_id_fkey(username, display_name),
       targetUser:profiles!reports_target_user_id_fkey(id, username, display_name, shadow_banned),
       targetEvent:events!reports_target_event_id_fkey(id, title)`
    )
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []).map((r: any) => ({
    id: r.id,
    reason: r.reason,
    category: r.category ?? null,
    detail: r.detail ?? null,
    status: r.status,
    resolution: r.resolution,
    created_at: r.created_at,
    reporter: r.reporter ?? null,
    targetUser: r.targetUser ?? null,
    targetEvent: r.targetEvent ?? null,
  }));
}

// Mark a report resolved or dismissed, stamping who reviewed it and when.
export async function reviewReport(
  reportId: string,
  moderatorId: string,
  status: 'resolved' | 'dismissed',
  resolution?: string
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('reports')
    .update({
      status,
      resolution: resolution ?? null,
      reviewed_by: moderatorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId);
  return error ? { error: error.message } : {};
}

// Delete an event (used by moderators acting on a reported event).
export async function moderatorDeleteEvent(eventId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  return error ? { error: error.message } : {};
}
