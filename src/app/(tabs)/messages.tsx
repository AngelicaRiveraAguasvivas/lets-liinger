import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarBubble } from '@/components/avatar-bubble';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/notifications-context';
import { useTheme } from '@/hooks/use-theme';
import {
  ConversationSummary, ProfileLite, fetchConversations, profileLabel, searchProfilesByUsername, subscribeToMyMessages,
} from '@/lib/messages';
import { supabase } from '../../supabaseClient';

// "Posted 3h ago" style relative label — each screen keeps its own copy,
// matching the existing convention (index.tsx, event-detail.tsx).
function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MessagesScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { markMessagesSeen } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  const [newMessageVisible, setNewMessageVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setConversations(await fetchConversations(user.id));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      markMessagesSeen(); // opening the inbox clears the unread dot
      if (!userId) return;
      return subscribeToMyMessages(userId, () => fetchAll());
      // fetchAll intentionally omitted: userId is only known after the first
      // fetch resolves, so this effect re-runs once fetchAll sets it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchAll, userId])
  );

  async function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (!userId) return;
    setSearching(true);
    setSearchResults(await searchProfilesByUsername(text, userId));
    setSearching(false);
  }

  function openNewMessage() {
    setSearchQuery('');
    setSearchResults([]);
    setNewMessageVisible(true);
  }

  function startConversationWith(otherUserId: string) {
    setNewMessageVisible(false);
    router.push(`/dm-thread?userId=${otherUserId}`);
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: {
      color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900',
      fontSize: 28, letterSpacing: -1,
    },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={dynamicStyles.headerText}>messages</ThemedText>
        </View>

        <ShadowSurface
          backgroundColor={colors.accentGreen}
          radius={14}
          offset={3}
          wrapperStyle={styles.newBtnShadow}
          style={styles.newBtn}
          onPress={openNewMessage}
        >
          <ThemedText style={styles.newBtnText}>+ NEW MESSAGE</ThemedText>
        </ShadowSurface>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        ) : conversations.length === 0 ? (
          <ThemedText style={styles.noteText} themeColor="textSecondary">
            No conversations yet. Tap “+ NEW MESSAGE” to say hi to someone.
          </ThemedText>
        ) : (
          conversations.map((c) => (
            <ShadowSurface
              key={c.otherUserId}
              backgroundColor={colors.backgroundElement}
              radius={16}
              offset={4}
              borderWidth={2}
              wrapperStyle={styles.cardShadow}
              style={styles.card}
              onPress={() => router.push(`/dm-thread?userId=${c.otherUserId}`)}
            >
              <View style={styles.cardRow}>
                <AvatarBubble url={c.otherProfile?.avatar_url} name={profileLabel(c.otherProfile)} size={44} />
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <ThemedText style={styles.cardName} numberOfLines={1}>
                      {profileLabel(c.otherProfile)}
                    </ThemedText>
                    <ThemedText style={styles.cardTime} themeColor="textSecondary">
                      {formatRelative(c.lastCreatedAt)}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.cardPreview} themeColor="textSecondary" numberOfLines={1}>
                    {c.lastMessageMine ? 'You: ' : ''}{c.lastContent}
                  </ThemedText>
                </View>
              </View>
            </ShadowSurface>
          ))
        )}
      </ScrollView>

      <Modal visible={newMessageVisible} animationType="slide" onRequestClose={() => setNewMessageVisible(false)}>
        <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setNewMessageVisible(false)}>
                <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>New message</ThemedText>
              <View style={styles.spacer} />
            </View>

            <TextField
              label="Search by username"
              autoCapitalize="none"
              autoFocus
              value={searchQuery}
              onChangeText={handleSearchChange}
            />

            {searching && (
              <ThemedText style={styles.searchHint} themeColor="textSecondary">Searching…</ThemedText>
            )}

            <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
              {searchResults.map((p) => (
                <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => startConversationWith(p.id)}>
                  <AvatarBubble url={p.avatar_url} name={profileLabel(p)} size={32} />
                  <ThemedText style={styles.resultText}>{profileLabel(p)}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.three,
  },
  newBtnShadow: { marginBottom: Spacing.three },
  newBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  newBtnText: { fontWeight: '900', color: '#000', fontSize: 14 },
  loadingWrap: { paddingVertical: Spacing.six, alignItems: 'center' },
  noteText: { fontSize: 13, fontWeight: '600' },
  cardShadow: { marginBottom: Spacing.two },
  card: { padding: Spacing.three },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  cardName: { fontSize: 15, fontWeight: '900', flex: 1 },
  cardTime: { fontSize: 11, fontWeight: '700' },
  cardPreview: { fontSize: 13, fontWeight: '600', marginTop: Spacing.one },
  modalContent: { flex: 1, padding: Spacing.four },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.two,
  },
  modalCancel: { fontSize: 15, fontWeight: '700', width: 50 },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  spacer: { width: 50 },
  searchHint: { fontSize: 12, fontWeight: '700', marginTop: Spacing.one },
  resultsList: { marginTop: Spacing.two },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: '#88888833' },
  resultText: { fontSize: 15, fontWeight: '800' },
});
