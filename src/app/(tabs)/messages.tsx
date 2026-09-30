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
import { GroupConversation, createGroup, fetchGroupConversations } from '@/lib/groups';
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
  const [groups, setGroups] = useState<GroupConversation[]>([]);

  const [newMessageVisible, setNewMessageVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);

  // New-group flow
  const [newGroupVisible, setNewGroupVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupResults, setGroupResults] = useState<ProfileLite[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<ProfileLite[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);
    const [convs, grps] = await Promise.all([fetchConversations(user.id), fetchGroupConversations()]);
    setConversations(convs);
    setGroups(grps);
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

  function openNewGroup() {
    setGroupName(''); setGroupSearch(''); setGroupResults([]); setSelectedMembers([]);
    setNewGroupVisible(true);
  }

  async function handleGroupSearch(text: string) {
    setGroupSearch(text);
    if (!userId) return;
    const found = await searchProfilesByUsername(text, userId);
    const sel = new Set(selectedMembers.map((m) => m.id));
    setGroupResults(found.filter((p) => !sel.has(p.id)));
  }

  function toggleMember(p: ProfileLite) {
    setSelectedMembers((prev) => (prev.some((m) => m.id === p.id) ? prev.filter((m) => m.id !== p.id) : [...prev, p]));
    setGroupResults((prev) => prev.filter((r) => r.id !== p.id));
    setGroupSearch('');
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setCreatingGroup(true);
    const tid = await createGroup(groupName.trim(), selectedMembers.map((m) => m.id));
    setCreatingGroup(false);
    if (tid) {
      setNewGroupVisible(false);
      router.push(`/group-thread?id=${tid}`);
    }
  }

  // DMs + groups in one list, most-recent first.
  const inboxItems = [
    ...conversations.map((c) => ({ kind: 'dm' as const, time: c.lastCreatedAt || '', c })),
    ...groups.map((g) => ({ kind: 'group' as const, time: g.lastCreatedAt || '', g })),
  ].sort((a, b) => b.time.localeCompare(a.time));

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

        <View style={styles.btnRow}>
          <ShadowSurface
            backgroundColor={colors.accentGreen}
            radius={14}
            offset={3}
            wrapperStyle={styles.btnFlex}
            style={styles.newBtn}
            onPress={openNewMessage}
          >
            <ThemedText style={styles.newBtnText}>+ MESSAGE</ThemedText>
          </ShadowSurface>
          <ShadowSurface
            backgroundColor={colors.accentCyan}
            radius={14}
            offset={3}
            wrapperStyle={styles.btnFlex}
            style={styles.newBtn}
            onPress={openNewGroup}
          >
            <ThemedText style={styles.newBtnText}>+ GROUP</ThemedText>
          </ShadowSurface>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        ) : inboxItems.length === 0 ? (
          <ThemedText style={styles.noteText} themeColor="textSecondary">
            No conversations yet. Start a message or a group chat above.
          </ThemedText>
        ) : (
          inboxItems.map((item) =>
            item.kind === 'dm' ? (
              <ShadowSurface
                key={`dm-${item.c.otherUserId}`}
                backgroundColor={colors.backgroundElement}
                radius={16} offset={4} borderWidth={2}
                wrapperStyle={styles.cardShadow} style={styles.card}
                onPress={() => router.push(`/dm-thread?userId=${item.c.otherUserId}`)}
              >
                <View style={styles.cardRow}>
                  <AvatarBubble url={item.c.otherProfile?.avatar_url} name={profileLabel(item.c.otherProfile)} size={44} userId={item.c.otherUserId} />
                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <ThemedText style={styles.cardName} numberOfLines={1}>{profileLabel(item.c.otherProfile)}</ThemedText>
                      <ThemedText style={styles.cardTime} themeColor="textSecondary">{formatRelative(item.c.lastCreatedAt)}</ThemedText>
                    </View>
                    <ThemedText style={styles.cardPreview} themeColor="textSecondary" numberOfLines={1}>
                      {item.c.lastMessageMine ? 'You: ' : ''}{item.c.lastContent}
                    </ThemedText>
                  </View>
                </View>
              </ShadowSurface>
            ) : (
              <ShadowSurface
                key={`g-${item.g.threadId}`}
                backgroundColor={colors.backgroundElement}
                radius={16} offset={4} borderWidth={2}
                wrapperStyle={styles.cardShadow} style={styles.card}
                onPress={() => router.push(`/group-thread?id=${item.g.threadId}`)}
              >
                <View style={styles.cardRow}>
                  <View style={[styles.groupAvatar, { backgroundColor: colors.accentPink, borderColor: colors.border }]}>
                    <ThemedText style={styles.groupAvatarText}>{(item.g.name || '?').charAt(0).toUpperCase()}</ThemedText>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <ThemedText style={styles.cardName} numberOfLines={1}>{item.g.name}</ThemedText>
                      {item.g.lastCreatedAt ? (
                        <ThemedText style={styles.cardTime} themeColor="textSecondary">{formatRelative(item.g.lastCreatedAt)}</ThemedText>
                      ) : null}
                    </View>
                    <ThemedText style={styles.cardPreview} themeColor="textSecondary" numberOfLines={1}>
                      {item.g.lastContent ?? `${item.g.memberCount} members · no messages yet`}
                    </ThemedText>
                  </View>
                </View>
              </ShadowSurface>
            )
          )
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
                  <AvatarBubble url={p.avatar_url} name={profileLabel(p)} size={32} userId={p.id} />
                  <ThemedText style={styles.resultText}>{profileLabel(p)}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={newGroupVisible} animationType="slide" onRequestClose={() => setNewGroupVisible(false)}>
        <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setNewGroupVisible(false)}>
                <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>New group</ThemedText>
              <TouchableOpacity
                onPress={handleCreateGroup}
                disabled={creatingGroup || !groupName.trim() || selectedMembers.length === 0}
              >
                <ThemedText style={[styles.modalCreate, { color: (!groupName.trim() || selectedMembers.length === 0) ? colors.textSecondary : colors.accentCyan }]}>
                  {creatingGroup ? '…' : 'Create'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <TextField label="Group name" autoFocus value={groupName} onChangeText={setGroupName} />

            {selectedMembers.length > 0 && (
              <View style={styles.chipWrap}>
                {selectedMembers.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.memberChip, { backgroundColor: colors.accentCyan, borderColor: colors.border }]}
                    onPress={() => toggleMember(m)}
                  >
                    <ThemedText style={styles.memberChipText}>{profileLabel(m)} ✕</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TextField label="Add people by username" autoCapitalize="none" value={groupSearch} onChangeText={handleGroupSearch} />

            <ScrollView style={styles.resultsList} keyboardShouldPersistTaps="handled">
              {groupResults.map((p) => (
                <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => toggleMember(p)}>
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
  btnRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  btnFlex: { flex: 1 },
  newBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  newBtnText: { fontWeight: '900', color: '#000', fontSize: 14 },
  groupAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { fontSize: 18, fontWeight: '900', color: '#000' },
  modalCreate: { fontSize: 15, fontWeight: '900', width: 56, textAlign: 'right' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  memberChip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 5 },
  memberChipText: { fontSize: 12, fontWeight: '900', color: '#000' },
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
