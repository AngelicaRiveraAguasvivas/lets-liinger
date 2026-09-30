import { ProfileLite } from './messages';
import { supabase } from '../supabaseClient';

export interface GroupConversation {
  threadId: string;
  name: string;
  lastContent: string | null;
  lastCreatedAt: string | null;
  memberCount: number;
}

export interface GroupMessage {
  id: string;
  thread_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

// Create a group with an initial member list (creator is added automatically).
// Returns the new thread id, or null on failure.
export async function createGroup(name: string, memberIds: string[]): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_group', { p_name: name, p_members: memberIds });
  if (error) return null;
  return (data as string) ?? null;
}

export async function fetchGroupConversations(): Promise<GroupConversation[]> {
  const { data } = await supabase.rpc('get_group_conversations');
  return ((data ?? []) as any[]).map((r) => ({
    threadId: r.thread_id,
    name: r.name,
    lastContent: r.last_content ?? null,
    lastCreatedAt: r.last_created_at ?? null,
    memberCount: r.member_count ?? 0,
  }));
}

export async function fetchGroupInfo(threadId: string): Promise<{ name: string; members: ProfileLite[] } | null> {
  const [{ data: thread }, { data: memberRows }] = await Promise.all([
    supabase.from('group_threads').select('name').eq('id', threadId).single(),
    supabase.from('group_members').select('user_id').eq('thread_id', threadId),
  ]);
  if (!thread) return null;
  const ids = (memberRows ?? []).map((r: any) => r.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids)
    : { data: [] as any[] };
  return { name: (thread as any).name, members: (profiles ?? []) as ProfileLite[] };
}

export async function fetchGroupMessages(threadId: string, limit = 50): Promise<GroupMessage[]> {
  const { data } = await supabase
    .from('group_messages')
    .select('id, thread_id, user_id, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as GroupMessage[]).slice().reverse();
}

export async function sendGroupMessage(threadId: string, userId: string, content: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('group_messages').insert({ thread_id: threadId, user_id: userId, content });
  return error ? { error: error.message } : {};
}

export async function addGroupMembers(threadId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await supabase.from('group_members').insert(userIds.map((u) => ({ thread_id: threadId, user_id: u })));
}

export async function leaveGroup(threadId: string, userId: string): Promise<void> {
  await supabase.from('group_members').delete().eq('thread_id', threadId).eq('user_id', userId);
}

// Realtime new-message feed for one thread. Returns an unsubscribe function.
export function subscribeToGroupMessages(threadId: string, onInsert: (m: GroupMessage) => void): () => void {
  const channel = supabase
    .channel(`group-${threadId}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onInsert(payload.new as GroupMessage)
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
