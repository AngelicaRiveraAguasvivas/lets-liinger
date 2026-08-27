import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DirectMessage, ProfileLite, fetchProfile, fetchThread, markThreadRead, profileLabel,
  sendDirectMessage, subscribeToMyMessages, subscribeToMyMessageUpdates, subscribeToTyping, toggleMessageLike,
} from '@/lib/messages';
import { checkClean } from '../lib/profanity';
import { supabase } from '../supabaseClient';

// Shows the time, plus the date when the message wasn't sent today.
function formatMessageDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return `${d.toLocaleDateString(undefined, opts)} · ${time}`;
}

// "Class of 2027 · UC Santa Cruz" line under the name.
function academicLine(p: ProfileLite | null): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.grad_year) parts.push(`Class of ${p.grad_year}`);
  if (p.university) parts.push(p.university);
  return parts.join(' · ');
}

function Avatar({ url, letter, borderColor, bg }: { url?: string | null; letter: string; borderColor: string; bg: string }) {
  return (
    <View style={[styles.avatar, { borderColor, backgroundColor: bg }]}>
      {url ? (
        <Image source={{ uri: url }} style={styles.avatarImg} resizeMode="cover" />
      ) : (
        <ThemedText style={styles.avatarInitial}>{letter.toUpperCase()}</ThemedText>
      )}
    </View>
  );
}

export default function DmThreadScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { userId: otherUserId } = useLocalSearchParams<{ userId: string }>();

  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null);
  const [otherProfile, setOtherProfile] = useState<ProfileLite | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const typingRef = useRef<{ notifyTyping: () => void } | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!otherUserId) { setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyUserId(user.id);

    const [me, profile, thread] = await Promise.all([
      fetchProfile(user.id),
      fetchProfile(otherUserId),
      fetchThread(user.id, otherUserId),
    ]);

    setMyProfile(me);
    setOtherProfile(profile);
    setMessages(thread);
    seenIds.current = new Set(thread.map((m) => m.id));
    setLoading(false);

    // Mark their messages as read (drives their "Seen" receipt).
    markThreadRead(otherUserId);
  }, [otherUserId]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      if (!myUserId) return;
      const unsubInsert = subscribeToMyMessages(myUserId, (row) => {
        if (row.sender_id !== otherUserId && row.recipient_id !== otherUserId) return;
        if (seenIds.current.has(row.id)) return;
        seenIds.current.add(row.id);
        setMessages((prev) => [...prev, row]);
        // I'm viewing the thread, so their new message is immediately read.
        if (row.sender_id === otherUserId) markThreadRead(otherUserId);
      });
      // Live-update likes + read receipts on existing messages.
      const unsubUpdate = subscribeToMyMessageUpdates(myUserId, (row) => {
        if (row.sender_id !== otherUserId && row.recipient_id !== otherUserId) return;
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)));
      });
      // Typing indicator channel.
      const typing = otherUserId
        ? subscribeToTyping(myUserId, otherUserId, () => {
            setOtherTyping(true);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setOtherTyping(false), 2500);
          })
        : null;
      typingRef.current = typing;
      return () => { unsubInsert(); unsubUpdate(); typing?.unsubscribe(); };
    }, [fetchAll, myUserId, otherUserId])
  );

  async function handleSend() {
    const text = newMessage.trim();
    if (!text || !myUserId || !otherUserId || sending) return;
    const badWord = checkClean(text);
    if (badWord) { setSendError(badWord); return; }
    setSendError('');
    setSending(true);
    const { error } = await sendDirectMessage(myUserId, otherUserId, text, replyTo?.id ?? null);
    setSending(false);
    if (error) return;
    setNewMessage('');
    setReplyTo(null);
    fetchAll();
  }

  async function handleLike(message: DirectMessage) {
    // Optimistic flip, then persist.
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, liked: !m.liked } : m)));
    await toggleMessageLike(message.id);
  }

  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // Show "Seen" when my most recent message has been read by the other person.
  const lastMsg = messages[messages.length - 1];
  const seenReceipt = !!lastMsg && lastMsg.sender_id === myUserId && !!lastMsg.read_at;

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: {
      color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900',
      fontSize: 20, letterSpacing: -1,
    },
    bubbleMine: { backgroundColor: colors.accentCyan, borderColor: colors.border },
    bubbleTheirs: { backgroundColor: colors.backgroundElement, borderColor: colors.border },
    input: {
      flex: 1, backgroundColor: colors.backgroundElement, color: colors.text,
      padding: Spacing.three, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 14,
    },
    sendBtn: {
      backgroundColor: colors.accentCyan, borderWidth: 2, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: Spacing.three, justifyContent: 'center',
    },
  }), [colors]);

  const subtitle = academicLine(otherProfile);
  const otherLetter = (otherProfile?.display_name || otherProfile?.username || '?').charAt(0);
  const myLetter = (myProfile?.display_name || myProfile?.username || '?').charAt(0);

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.text} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}>
          <ThemedText style={dynamicStyles.headerText}>‹ back</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => otherUserId && router.push(`/user?id=${otherUserId}`)}>
          <ThemedText style={dynamicStyles.headerText} numberOfLines={1}>
            {profileLabel(otherProfile)}
          </ThemedText>
          {otherTyping ? (
            <ThemedText style={styles.headerSub} themeColor="accentCyan" numberOfLines={1}>typing…</ThemedText>
          ) : subtitle ? (
            <ThemedText style={styles.headerSub} themeColor="textSecondary" numberOfLines={1}>{subtitle}</ThemedText>
          ) : null}
        </TouchableOpacity>
        <View style={styles.spacer} />
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          seenReceipt ? (
            <ThemedText style={styles.seenReceipt} themeColor="textSecondary">Seen</ThemedText>
          ) : null
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === myUserId;
          const repliedTo = item.reply_to_id ? msgById.get(item.reply_to_id) : null;
          return (
            <MessageBubble
              message={item}
              mine={mine}
              repliedTo={repliedTo ?? null}
              avatarUrl={mine ? myProfile?.avatar_url : otherProfile?.avatar_url}
              avatarLetter={mine ? myLetter : otherLetter}
              colors={colors}
              bubbleStyle={mine ? dynamicStyles.bubbleMine : dynamicStyles.bubbleTheirs}
              onReply={setReplyTo}
              onLike={handleLike}
            />
          );
        }}
        ListEmptyComponent={
          <ThemedText style={styles.emptyText} themeColor="textSecondary">
            No messages yet. Say hello!
          </ThemedText>
        }
      />

      {sendError ? <ThemedText style={styles.sendError}>{sendError}</ThemedText> : null}

      {replyTo ? (
        <View style={[styles.replyBar, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
          <View style={styles.replyBarText}>
            <ThemedText style={styles.replyBarLabel} themeColor="accentCyan">Replying to</ThemedText>
            <ThemedText style={styles.replyBarSnippet} themeColor="textSecondary" numberOfLines={1}>
              {replyTo.content}
            </ThemedText>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
            <ThemedText style={styles.replyBarClose}>✕</ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.composerRow}>
        <TextInput
          style={dynamicStyles.input}
          placeholder={replyTo ? 'Write a reply…' : 'Message...'}
          placeholderTextColor={colors.textSecondary}
          value={newMessage}
          onChangeText={(t) => { setNewMessage(t); typingRef.current?.notifyTyping(); }}
          multiline
        />
        <TouchableOpacity style={dynamicStyles.sendBtn} onPress={handleSend} disabled={sending}>
          <ThemedText style={styles.sendBtnText}>{sending ? '...' : 'Send'}</ThemedText>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function MessageBubble({
  message, mine, repliedTo, avatarUrl, avatarLetter, colors, bubbleStyle, onReply, onLike,
}: {
  message: DirectMessage;
  mine: boolean;
  repliedTo: DirectMessage | null;
  avatarUrl?: string | null;
  avatarLetter: string;
  colors: ReturnType<typeof useTheme>;
  bubbleStyle: any;
  onReply: (m: DirectMessage) => void;
  onLike: (m: DirectMessage) => void;
}) {
  // Single tap → reply; double tap → like. We wait briefly after the first tap
  // to see whether a second one lands.
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePress() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (timer.current) clearTimeout(timer.current);
      lastTap.current = 0;
      onLike(message);
    } else {
      lastTap.current = now;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onReply(message), 280);
    }
  }

  const avatar = (
    <Avatar url={avatarUrl} letter={avatarLetter} borderColor={colors.border} bg={mine ? colors.accentCyan : colors.accentYellow} />
  );

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine ? avatar : null}
      <Pressable style={[styles.bubble, bubbleStyle]} onPress={handlePress}>
        {repliedTo ? (
          <View style={[styles.replyQuote, { borderLeftColor: colors.border }]}>
            <ThemedText style={styles.replyQuoteText} numberOfLines={1}>{repliedTo.content}</ThemedText>
          </View>
        ) : null}
        <ThemedText style={styles.bubbleText}>{message.content}</ThemedText>
        <ThemedText style={styles.bubbleTime} themeColor="textSecondary">
          {formatMessageDateTime(message.created_at)}
        </ThemedText>
        {message.liked ? (
          <View style={[styles.likeBadge, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <ThemedText style={styles.likeHeart}>♥</ThemedText>
          </View>
        ) : null}
      </Pressable>
      {mine ? avatar : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.four, paddingBottom: Spacing.two,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSub: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  spacer: { width: 50 },
  list: { flex: 1 },
  listContent: { padding: Spacing.four, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: Spacing.two, gap: Spacing.one },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatar: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 12, fontWeight: '900', color: '#000' },
  bubble: {
    maxWidth: '78%', borderWidth: 2, borderRadius: 14,
    paddingVertical: Spacing.two, paddingHorizontal: Spacing.three,
  },
  bubbleText: { fontSize: 14, fontWeight: '600' },
  bubbleTime: { fontSize: 10, fontWeight: '600', marginTop: Spacing.one, textAlign: 'right' },
  replyQuote: {
    borderLeftWidth: 3, paddingLeft: Spacing.two, marginBottom: Spacing.one, opacity: 0.8,
  },
  replyQuoteText: { fontSize: 12, fontWeight: '600', fontStyle: 'italic' },
  likeBadge: {
    position: 'absolute', bottom: -8, right: -6,
    borderWidth: 2, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 0,
  },
  likeHeart: { fontSize: 11, color: '#FF007F', fontWeight: '900' },
  seenReceipt: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: Spacing.one },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: Spacing.six },
  replyBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    marginHorizontal: Spacing.four, marginBottom: Spacing.one,
    borderWidth: 2, borderRadius: 10, padding: Spacing.two,
  },
  replyBarText: { flex: 1 },
  replyBarLabel: { fontSize: 11, fontWeight: '900' },
  replyBarSnippet: { fontSize: 12, fontWeight: '600' },
  replyBarClose: { fontSize: 14, fontWeight: '900' },
  composerRow: {
    flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end',
    padding: Spacing.four, paddingTop: Spacing.two,
  },
  sendBtnText: { fontWeight: '900', color: '#000', fontSize: 14 },
  sendError: { color: '#ff6b6b', fontWeight: '700', fontSize: 12, paddingHorizontal: Spacing.three, marginBottom: Spacing.one },
});
