import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarBubble } from '@/components/avatar-bubble';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  GroupMessage, fetchGroupInfo, fetchGroupMessages, leaveGroup, sendGroupMessage, subscribeToGroupMessages,
} from '@/lib/groups';
import { ProfileLite, profileLabel } from '@/lib/messages';
import { checkClean } from '../lib/profanity';
import { supabase } from '../supabaseClient';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? time
    : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}

export default function GroupThreadScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<ProfileLite[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [membersVisible, setMembersVisible] = useState(false);
  const listRef = useRef<FlatList<GroupMessage>>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    const [info, msgs] = await Promise.all([fetchGroupInfo(id), fetchGroupMessages(id)]);
    if (info) { setName(info.name); setMembers(info.members); }
    setMessages(msgs);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!id) return;
      return subscribeToGroupMessages(id, (m) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      });
    }, [load, id])
  );

  async function send() {
    const text = input.trim();
    if (!text || !userId || !id) return;
    const bad = checkClean(text);
    if (bad) { setError(bad); return; }
    setError('');
    setSending(true);
    const res = await sendGroupMessage(id, userId, text);
    setSending(false);
    if (!res.error) setInput('');
    else setError(res.error);
  }

  async function handleLeave() {
    if (!id || !userId) return;
    await leaveGroup(id, userId);
    setMembersVisible(false);
    router.replace('/messages');
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.text} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}>
          <ThemedText style={[styles.back, { color: colors.text }]}>‹</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setMembersVisible(true)} activeOpacity={0.7}>
          <ThemedText style={styles.headerName} numberOfLines={1}>{name}</ThemedText>
          <ThemedText style={styles.headerSub} themeColor="textSecondary">{members.length} members · tap to view</ThemedText>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <ThemedText style={styles.empty} themeColor="textSecondary">No messages yet. Say hi 👋</ThemedText>
        }
        renderItem={({ item }) => {
          const mine = item.user_id === userId;
          const author = memberById.get(item.user_id);
          if (mine) {
            return (
              <View style={styles.rowMine}>
                <View style={[styles.bubble, styles.bubbleMine, { backgroundColor: colors.accentCyan }]}>
                  <ThemedText style={styles.bubbleTextMine}>{item.content}</ThemedText>
                  <ThemedText style={styles.timeMine}>{formatTime(item.created_at)}</ThemedText>
                </View>
              </View>
            );
          }
          return (
            <View style={styles.rowTheirs}>
              <AvatarBubble url={author?.avatar_url} name={profileLabel(author)} size={30} userId={item.user_id} />
              <View style={[styles.bubble, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
                <ThemedText style={styles.author} themeColor="accentPink">{profileLabel(author)}</ThemedText>
                <ThemedText style={styles.bubbleText}>{item.content}</ThemedText>
                <ThemedText style={styles.time} themeColor="textSecondary">{formatTime(item.created_at)}</ThemedText>
              </View>
            </View>
          );
        }}
      />

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.border }]}
          placeholder="Message the group…"
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.accentGreen, borderColor: colors.border }]}
          onPress={send}
          disabled={sending}
        >
          <ThemedText style={styles.sendText}>{sending ? '…' : 'Send'}</ThemedText>
        </TouchableOpacity>
      </View>

      <Modal visible={membersVisible} animationType="slide" onRequestClose={() => setMembersVisible(false)}>
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setMembersVisible(false)}>
                <ThemedText style={styles.modalClose}>Done</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>{name}</ThemedText>
              <View style={styles.spacer} />
            </View>
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.memberRow}
                onPress={() => { setMembersVisible(false); if (m.id !== userId) router.push(`/user?id=${m.id}`); }}
                disabled={m.id === userId}
              >
                <AvatarBubble url={m.avatar_url} name={profileLabel(m)} size={36} userId={m.id} />
                <ThemedText style={styles.memberName}>{profileLabel(m)}{m.id === userId ? ' (you)' : ''}</ThemedText>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.leaveBtn, { borderColor: colors.border }]} onPress={handleLeave}>
              <ThemedText style={[styles.leaveText, { color: colors.accentPink }]}>Leave group</ThemedText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderBottomWidth: 2 },
  back: { fontSize: 28, fontWeight: '900' },
  headerCenter: { flex: 1 },
  headerName: { fontSize: 17, fontWeight: '900' },
  headerSub: { fontSize: 11, fontWeight: '700' },
  messages: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  empty: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: Spacing.six },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderWidth: 2 },
  bubbleMine: { borderWidth: 0 },
  author: { fontSize: 11, fontWeight: '900', marginBottom: 2 },
  bubbleText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  bubbleTextMine: { fontSize: 14, fontWeight: '700', lineHeight: 19, color: '#000' },
  time: { fontSize: 9, fontWeight: '600', marginTop: 3 },
  timeMine: { fontSize: 9, fontWeight: '700', marginTop: 3, color: '#00000088' },
  error: { color: '#ff6b6b', fontWeight: '700', fontSize: 12, textAlign: 'center', paddingHorizontal: Spacing.three },
  inputRow: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three, borderTopWidth: 2, alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 2, borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 14, maxHeight: 100 },
  sendBtn: { borderWidth: 2, borderRadius: 14, paddingHorizontal: Spacing.four, justifyContent: 'center', paddingVertical: Spacing.two },
  sendText: { fontWeight: '900', color: '#000', fontSize: 14 },
  modalContent: { flex: 1, padding: Spacing.four },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  modalClose: { fontSize: 15, fontWeight: '700', width: 50 },
  modalTitle: { fontSize: 18, fontWeight: '900', flex: 1, textAlign: 'center' },
  spacer: { width: 50 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  memberName: { fontSize: 15, fontWeight: '800' },
  leaveBtn: { borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.four },
  leaveText: { fontWeight: '900', fontSize: 14 },
});
