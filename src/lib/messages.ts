import { supabase } from '../supabaseClient';

export interface ProfileLite {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  // Academic info (only populated by fetchProfile, for the thread header).
  university?: string | null;
  grad_year?: string | null;
  major?: string | null;
  minor?: string | null;
  cohort?: string | null;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  reply_to_id: string | null;
  liked: boolean;
  read_at: string | null;
}

export interface ConversationSummary {
  otherUserId: string;
  otherProfile: ProfileLite | null;
  lastContent: string;
  lastCreatedAt: string;
  lastMessageMine: boolean;
}

// One row per conversation, newest first. Backed by the get_conversations()
// Postgres function so the inbox never has to download full message history
// just to show a handful of previews.
export async function fetchConversations(myUserId: string): Promise<ConversationSummary[]> {
  const { data: rows } = await supabase.rpc('get_conversations');
  const list = rows ?? [];
  if (list.length === 0) return [];

  const otherIds = list.map((r: any) => r.other_user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', otherIds);

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p as ProfileLite]));

  return list
    .map((r: any) => ({
      otherUserId: r.other_user_id,
      otherProfile: profileById.get(r.other_user_id) ?? null,
      lastContent: r.last_content,
      lastCreatedAt: r.last_created_at,
      lastMessageMine: r.last_sender_id === myUserId,
    }))
    .sort((a: ConversationSummary, b: ConversationSummary) => b.lastCreatedAt.localeCompare(a.lastCreatedAt));
}

// The most recent `limit` messages between exactly two users, oldest first.
// Capped rather than full history — see dm-thread.tsx for the FlatList
// rendering that this pairs with.
export async function fetchThread(myUserId: string, otherUserId: string, limit = 50): Promise<DirectMessage[]> {
  const { data } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, content, created_at, reply_to_id, liked, read_at')
    .or(`and(sender_id.eq.${myUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${myUserId})`)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).slice().reverse();
}

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  content: string,
  replyToId?: string | null
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content, reply_to_id: replyToId ?? null });
  if (error) return { error: error.message };
  return {};
}

// Double-tap like: flips the `liked` flag via a SECURITY DEFINER RPC that only
// lets participants toggle their own conversation's messages. Returns the new
// liked state.
export async function toggleMessageLike(messageId: string): Promise<boolean> {
  const { data } = await supabase.rpc('toggle_dm_like', { msg_id: messageId });
  return !!data;
}

// Mark every message the other person sent me in this thread as read (powers
// read receipts — the sender then sees "Seen" via the realtime UPDATE feed).
export async function markThreadRead(otherUserId: string): Promise<void> {
  await supabase.rpc('mark_thread_read', { other_id: otherUserId });
}

export async function fetchProfile(userId: string): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, university, grad_year, major, minor, cohort')
    .eq('id', userId)
    .single();
  return (data as ProfileLite) ?? null;
}

export async function searchProfilesByUsername(query: string, excludeUserId: string): Promise<ProfileLite[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', `%${trimmed}%`)
    .neq('id', excludeUserId)
    .limit(20);
  return (data as ProfileLite[]) ?? [];
}

// Registers two INSERT listeners on one realtime channel — Postgres-changes
// filters only support a single `column=eq.value` condition, so "sender OR
// recipient is me" needs two separate registrations rather than one filter.
// Returns an unsubscribe function.
export function subscribeToMyMessages(myUserId: string, onInsert: (row: DirectMessage) => void): () => void {
  const channel = supabase
    .channel(`dm-${myUserId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${myUserId}` },
      (payload) => onInsert(payload.new as DirectMessage)
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${myUserId}` },
      (payload) => onInsert(payload.new as DirectMessage)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Realtime UPDATEs to my messages (e.g. the other person liking one). Returns
// an unsubscribe function. Pairs with subscribeToMyMessages (which is INSERTs).
export function subscribeToMyMessageUpdates(myUserId: string, onUpdate: (row: DirectMessage) => void): () => void {
  const channel = supabase
    .channel(`dm-upd-${myUserId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${myUserId}` },
      (payload) => onUpdate(payload.new as DirectMessage)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${myUserId}` },
      (payload) => onUpdate(payload.new as DirectMessage)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Ephemeral "is typing" over a realtime broadcast channel shared by the two
// participants (no DB writes). `notifyTyping` is throttled; call it on each
// keystroke. `onTyping` fires when the OTHER person is typing.
export function subscribeToTyping(
  myId: string,
  otherId: string,
  onTyping: () => void
): { notifyTyping: () => void; unsubscribe: () => void } {
  const key = [myId, otherId].sort().join('_');
  const channel = supabase
    .channel(`typing-${key}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, (payload) => {
      if ((payload.payload as any)?.from === otherId) onTyping();
    })
    .subscribe();

  let last = 0;
  const notifyTyping = () => {
    const now = Date.now();
    if (now - last < 1500) return; // throttle broadcasts
    last = now;
    channel.send({ type: 'broadcast', event: 'typing', payload: { from: myId } });
  };

  return { notifyTyping, unsubscribe: () => { supabase.removeChannel(channel); } };
}

export function profileLabel(p: ProfileLite | null | undefined): string {
  if (!p) return 'Someone';
  return p.username ? `@${p.username}` : p.display_name ?? 'Someone';
}
