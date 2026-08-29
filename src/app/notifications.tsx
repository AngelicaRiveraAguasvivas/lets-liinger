import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { followUser, markNotificationsSeen, unfollowUser } from '../lib/follows';
import { getAllNotifications, type NotificationItem } from '../lib/notifications';
import { supabase } from '../supabaseClient';

function relative(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function NotificationsScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) { setLoading(false); return; }
        setSelfId(user.id);
        const list = await getAllNotifications(user.id);
        if (cancelled) return;
        setItems(list);
        setFollowingIds(
          new Set(
            list
              .filter(
                (i): i is Extract<NotificationItem, { kind: 'follow' }> =>
                  i.kind === 'follow' && i.followsBack
              )
              .map((i) => i.profile.id)
          )
        );
        setLoading(false);
        markNotificationsSeen(user.id); // clear the unread follower badge
      })();
      return () => { cancelled = true; };
    }, [])
  );

  async function toggleFollow(id: string) {
    if (!selfId) return;
    const next = new Set(followingIds);
    if (next.has(id)) {
      next.delete(id);
      setFollowingIds(next);
      await unfollowUser(selfId, id);
    } else {
      next.add(id);
      setFollowingIds(next);
      await followUser(selfId, id);
    }
  }

  function avatarFor(profile: { id?: string; avatar_url: string | null } | null, name: string, bg: string) {
    const circle = (
      <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: bg }]}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <ThemedText style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</ThemedText>
        )}
      </View>
    );
    if (!profile?.id) return circle;
    return <Pressable onPress={() => router.push(`/user?id=${profile.id}`)} hitSlop={4}>{circle}</Pressable>;
  }

  function renderItem(it: NotificationItem) {
    if (it.kind === 'follow') {
      const name = it.profile.display_name || it.profile.username || 'Someone';
      const following = followingIds.has(it.profile.id);
      return (
        <ShadowSurface
          key={it.key}
          backgroundColor={colors.backgroundElement}
          radius={14} offset={3} borderWidth={2}
          wrapperStyle={styles.rowWrap} style={styles.row}
          onPress={() => router.push(`/user?id=${it.profile.id}`)}
        >
          {avatarFor(it.profile, name, colors.accentYellow)}
          <View style={styles.info}>
            <ThemedText style={styles.text} numberOfLines={2}>
              <ThemedText style={styles.bold}>@{it.profile.username || 'user'}</ThemedText> started following you
            </ThemedText>
            <ThemedText style={styles.time} themeColor="textSecondary">{relative(it.createdAt)}</ThemedText>
          </View>
          <ShadowSurface
            backgroundColor={following ? colors.backgroundElement : colors.accentPink}
            radius={10} offset={2} borderWidth={2}
            onPress={() => toggleFollow(it.profile.id)} style={styles.followBtn}
          >
            <ThemedText style={[styles.followText, { color: following ? colors.text : '#000' }]}>
              {following ? 'Following' : 'Follow back'}
            </ThemedText>
          </ShadowSurface>
        </ShadowSurface>
      );
    }

    if (it.kind === 'message') {
      const name = it.profile.display_name || it.profile.username || 'Someone';
      return (
        <ShadowSurface
          key={it.key}
          backgroundColor={colors.backgroundElement}
          radius={14} offset={3} borderWidth={2}
          wrapperStyle={styles.rowWrap} style={styles.row}
          onPress={() => router.push(`/dm-thread?userId=${it.profile.id}`)}
        >
          {avatarFor(it.profile, name, colors.accentCyan)}
          <View style={styles.info}>
            <ThemedText style={styles.text} numberOfLines={2}>
              <ThemedText style={styles.bold}>@{it.profile.username || 'user'}</ThemedText> sent you a message
            </ThemedText>
            <ThemedText style={styles.preview} themeColor="textSecondary" numberOfLines={1}>{it.preview}</ThemedText>
            <ThemedText style={styles.time} themeColor="textSecondary">{relative(it.createdAt)}</ThemedText>
          </View>
        </ShadowSurface>
      );
    }

    if (it.kind === 'engagement') {
      const name = it.profile?.display_name || it.profile?.username || 'Someone';
      return (
        <ShadowSurface
          key={it.key}
          backgroundColor={colors.backgroundElement}
          radius={14} offset={3} borderWidth={2}
          wrapperStyle={styles.rowWrap} style={styles.row}
          onPress={() => router.push(`/event-detail?id=${it.eventId}`)}
        >
          {avatarFor(it.profile, name, colors.accentPink)}
          <View style={styles.info}>
            <ThemedText style={styles.text} numberOfLines={2}>
              <ThemedText style={styles.bold}>@{it.profile?.username || 'someone'}</ThemedText> {it.verb} your event
            </ThemedText>
            <ThemedText style={styles.preview} themeColor="textSecondary" numberOfLines={1}>{it.title}</ThemedText>
            <ThemedText style={styles.time} themeColor="textSecondary">{relative(it.createdAt)}</ThemedText>
          </View>
        </ShadowSurface>
      );
    }

    // event
    const name = it.profile?.display_name || it.profile?.username || 'Someone';
    return (
      <ShadowSurface
        key={it.key}
        backgroundColor={colors.backgroundElement}
        radius={14} offset={3} borderWidth={2}
        wrapperStyle={styles.rowWrap} style={styles.row}
        onPress={() => router.push(`/event-detail?id=${it.eventId}`)}
      >
        {avatarFor(it.profile, name, colors.accentGreen)}
        <View style={styles.info}>
          <ThemedText style={styles.text} numberOfLines={2}>
            <ThemedText style={styles.bold}>@{it.profile?.username || 'someone'}</ThemedText> posted a new event
          </ThemedText>
          <ThemedText style={styles.preview} themeColor="textSecondary" numberOfLines={1}>{it.title}</ThemedText>
          <ThemedText style={styles.time} themeColor="textSecondary">{relative(it.createdAt)}</ThemedText>
        </View>
      </ShadowSurface>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn}>
          <ThemedText style={[styles.back, { color: colors.text }]}>‹ back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={[styles.title, { color: colors.text }]}>notifications</ThemedText>

        {loading ? (
          <ActivityIndicator size="large" color={colors.text} style={{ marginTop: Spacing.four }} />
        ) : items.length === 0 ? (
          <ThemedText style={styles.note} themeColor="textSecondary">
            Nothing yet. Follows, messages, and new events will show up here.
          </ThemedText>
        ) : (
          items.map(renderItem)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 130 },
  backBtn: { marginBottom: Spacing.two },
  back: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  title: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 26, letterSpacing: -1, marginBottom: Spacing.three },
  note: { fontSize: 13, fontWeight: '600', marginTop: Spacing.four, textAlign: 'center' },
  rowWrap: { marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.two, gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 18, fontWeight: '900', color: '#000' },
  info: { flex: 1 },
  text: { fontSize: 13, fontWeight: '600' },
  bold: { fontSize: 13, fontWeight: '900' },
  preview: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  time: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  followBtn: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  followText: { fontWeight: '900', fontSize: 11 },
  emojiTag: { fontSize: 18, paddingHorizontal: Spacing.one },
});
