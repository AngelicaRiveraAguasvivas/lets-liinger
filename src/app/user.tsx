import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { followUser, getFollowCounts, getMutualFollowers, isFollowing as checkFollowing, unfollowUser } from '../lib/follows';
import { blockUser, getMyBlockedIds, reportUser, unblockUser } from '../lib/moderation';
import { supabase } from '../supabaseClient';

interface ViewProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  interests: string[] | null;
  extracurriculars: { name: string; role: string }[] | null;
  university: string | null;
  major: string | null;
  minor: string | null;
  grad_year: string | null;
  cohort: string | null;
  is_private: boolean | null;
}

export default function UserProfileScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ViewProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutuals, setMutuals] = useState<{ names: string[]; count: number }>({ names: [], count: 0 });
  const [blocked, setBlocked] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reported, setReported] = useState(false);
  const [hosting, setHosting] = useState<{ id: string; title: string; location: string | null }[]>([]);
  const [going, setGoing] = useState<{ id: string; title: string; location: string | null }[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) { setLoading(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        // Viewing yourself → send to your own editable profile.
        if (user && user.id === id) {
          router.replace('/profile');
          return;
        }
        setSelfId(user?.id ?? null);

        const [profRes, c, isF, mut, myBlocked] = await Promise.all([
          supabase.from('profiles').select('id, display_name, username, bio, avatar_url, interests, extracurriculars, university, major, minor, grad_year, cohort, is_private').eq('id', id).single(),
          getFollowCounts(id),
          user ? checkFollowing(user.id, id) : Promise.resolve(false),
          user ? getMutualFollowers(user.id, id) : Promise.resolve({ names: [], count: 0 }),
          user ? getMyBlockedIds(user.id) : Promise.resolve(new Set<string>()),
        ]);
        if (cancelled) return;
        if (!profRes.error) setProfile(profRes.data as ViewProfile);
        setCounts(c);
        setFollowing(isF);
        setMutuals(mut);
        setBlocked(myBlocked.has(id));

        const [hostRes, goRes] = await Promise.all([
          supabase.from('events').select('id, title, location').eq('created_by', id).order('created_at', { ascending: false }).limit(10),
          supabase.from('rsvps').select('event:events!rsvps_event_id_fkey(id, title, location)').eq('user_id', id).limit(10),
        ]);
        if (cancelled) return;
        setHosting((hostRes.data as any[]) ?? []);
        setGoing(((goRes.data ?? []) as any[]).map((r) => r.event).filter(Boolean));
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [id])
  );

  async function toggleFollow() {
    if (!selfId || !id || busy) return;
    setBusy(true);
    if (following) {
      setFollowing(false);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
      await unfollowUser(selfId, id);
    } else {
      setFollowing(true);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
      await followUser(selfId, id);
    }
    setBusy(false);
  }

  async function handleBlock() {
    if (!selfId || !id) return;
    setMenuVisible(false);
    if (blocked) {
      setBlocked(false);
      await unblockUser(selfId, id);
    } else {
      setBlocked(true);
      setFollowing(false);
      await blockUser(selfId, id);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }

  async function handleReport() {
    if (!selfId || !id) return;
    setMenuVisible(false);
    setReported(true);
    await reportUser(selfId, id, 'reported from profile');
  }

  const clubColors = [colors.accentPink, colors.accentCyan, colors.accentYellow, colors.accentGreen];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.text} /></View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><ThemedText style={[styles.back, { color: colors.text }]}>‹ back</ThemedText></TouchableOpacity>
          <ThemedText style={styles.note} themeColor="textSecondary">Profile not found.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  const name = (profile.display_name || 'Student').toUpperCase();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ThemedText style={[styles.back, { color: colors.text }]}>‹ back</ThemedText>
          </TouchableOpacity>
          {selfId && <IconButton emoji="⋯" onPress={() => setMenuVisible(true)} />}
        </View>

        {reported && (
          <ThemedText style={styles.reported} themeColor="textSecondary">
            ✓ Reported. Thanks — our team will review this.
          </ThemedText>
        )}

        <ShadowSurface backgroundColor={colors.backgroundElement} radius={24} offset={6} wrapperStyle={styles.mb4} style={styles.card}>
          <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.accentYellow }]}>
            {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" /> : null}
          </View>

          <ThemedText style={styles.userName}>{name}</ThemedText>
          <Badge label={`@${profile.username || 'username'}`} backgroundColor={colors.accentCyan} radius={12} style={styles.handleBadge} />

          {(profile.grad_year || profile.university) && (
            <ThemedText style={styles.academicPrimary} themeColor="textSecondary">
              {[profile.grad_year ? `Class of ${profile.grad_year}` : null, profile.university]
                .filter(Boolean).join(' · ')}
            </ThemedText>
          )}
          {(profile.major || profile.minor || profile.cohort) && (
            <ThemedText style={styles.academicSecondary} themeColor="textSecondary">
              {[profile.major, profile.minor ? `Minor in ${profile.minor}` : null, profile.cohort]
                .filter(Boolean).join(' · ')}
            </ThemedText>
          )}

          <ThemedText style={styles.bio}>{profile.bio || 'No bio yet.'}</ThemedText>

          {!!profile.interests?.length && (
            <View style={styles.interestsWrap}>
              {profile.interests.map((tag) => (
                <View key={tag} style={[styles.interestChip, { borderColor: colors.border }]}>
                  <ThemedText style={styles.interestChipText}>{tag}</ThemedText>
                </View>
              ))}
            </View>
          )}

          {mutuals.count > 0 && (
            <ThemedText style={styles.mutuals} themeColor="textSecondary">
              Followed by {mutuals.names.slice(0, 2).join(', ')}
              {mutuals.count > 2 ? ` and ${mutuals.count - 2} others you follow` : ' you follow'}
            </ThemedText>
          )}

          {selfId && (
            <View style={styles.actionRow}>
              <ShadowSurface
                backgroundColor={following ? colors.backgroundElement : colors.accentPink}
                radius={14} offset={3}
                wrapperStyle={styles.actionFlex} style={styles.followBtn}
                onPress={toggleFollow}
              >
                <ThemedText style={[styles.followText, { color: following ? colors.text : '#000' }]}>
                  {following ? '✓ FOLLOWING' : '+ FOLLOW'}
                </ThemedText>
              </ShadowSurface>
              <ShadowSurface
                backgroundColor={colors.accentCyan}
                radius={14} offset={3}
                wrapperStyle={styles.actionFlex} style={styles.followBtn}
                onPress={() => router.push(`/dm-thread?userId=${profile.id}`)}
              >
                <ThemedText style={[styles.followText, { color: '#000' }]}>MESSAGE</ThemedText>
              </ShadowSurface>
            </View>
          )}
        </ShadowSurface>

        <View style={styles.statsRow}>
          <ShadowSurface
            backgroundColor={colors.backgroundElement} radius={16} offset={4}
            wrapperStyle={styles.statBox} style={styles.statInner}
            onPress={() => router.push(`/connections?userId=${profile.id}&type=followers`)}
          >
            <ThemedText style={styles.statNum}>{counts.followers}</ThemedText>
            <ThemedText style={styles.statLabel}>FOLLOWERS</ThemedText>
          </ShadowSurface>
          <ShadowSurface
            backgroundColor={colors.backgroundElement} radius={16} offset={4}
            wrapperStyle={styles.statBox} style={styles.statInner}
            onPress={() => router.push(`/connections?userId=${profile.id}&type=following`)}
          >
            <ThemedText style={styles.statNum}>{counts.following}</ThemedText>
            <ThemedText style={styles.statLabel}>FOLLOWING</ThemedText>
          </ShadowSurface>
        </View>

        {!!profile.extracurriculars?.length && (
          <>
            <ThemedText style={[styles.section, { color: colors.text }]}>CLUBS</ThemedText>
            {profile.extracurriculars.map((club, i) => (
              <ShadowSurface
                key={`${club.name}-${i}`}
                backgroundColor={clubColors[i % clubColors.length]}
                radius={14} offset={3} wrapperStyle={styles.mb2} style={styles.clubTag}
                onPress={() => router.push(`/club?name=${encodeURIComponent(club.name)}`)}
              >
                <ThemedText style={styles.clubName}>{club.name}</ThemedText>
                <View style={[styles.roleBadge, { borderColor: colors.border }]}>
                  <ThemedText style={styles.roleText}>{club.role}</ThemedText>
                </View>
              </ShadowSurface>
            ))}
          </>
        )}

        {profile.is_private && !following && (
          <ThemedText style={[styles.section, { color: colors.text }]}>This account is private — follow to see their events.</ThemedText>
        )}

        {(!profile.is_private || following) && hosting.length > 0 && (
          <>
            <ThemedText style={[styles.section, { color: colors.text }]}>HOSTING</ThemedText>
            {hosting.map((e) => (
              <ShadowSurface
                key={`h-${e.id}`}
                backgroundColor={colors.backgroundElement}
                radius={14} offset={3} borderWidth={2} wrapperStyle={styles.mb2} style={styles.eventRow}
                onPress={() => router.push(`/event-detail?id=${e.id}`)}
              >
                <ThemedText style={styles.eventRowTitle} numberOfLines={1}>{e.title}</ThemedText>
                {e.location ? <ThemedText style={styles.eventRowSub} themeColor="textSecondary" numberOfLines={1}>{e.location}</ThemedText> : null}
              </ShadowSurface>
            ))}
          </>
        )}

        {(!profile.is_private || following) && going.length > 0 && (
          <>
            <ThemedText style={[styles.section, { color: colors.text }]}>GOING TO</ThemedText>
            {going.map((e) => (
              <ShadowSurface
                key={`g-${e.id}`}
                backgroundColor={colors.backgroundElement}
                radius={14} offset={3} borderWidth={2} wrapperStyle={styles.mb2} style={styles.eventRow}
                onPress={() => router.push(`/event-detail?id=${e.id}`)}
              >
                <ThemedText style={styles.eventRowTitle} numberOfLines={1}>{e.title}</ThemedText>
                {e.location ? <ThemedText style={styles.eventRowSub} themeColor="textSecondary" numberOfLines={1}>{e.location}</ThemedText> : null}
              </ShadowSurface>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.menuShadow} style={styles.menu}>
            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <ThemedText style={styles.menuItemText}>Report</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
              <ThemedText style={[styles.menuItemText, { color: colors.accentPink }]}>
                {blocked ? 'Unblock' : 'Block'}
              </ThemedText>
            </TouchableOpacity>
          </ShadowSurface>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 130 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  back: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  reported: { fontSize: 12, fontWeight: '700', marginBottom: Spacing.two, textAlign: 'center' },
  mutuals: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: Spacing.one },
  actionRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two, width: '100%' },
  actionFlex: { flex: 1 },
  menuBackdrop: { flex: 1, alignItems: 'flex-end' },
  menuShadow: { marginTop: 60, marginRight: Spacing.four },
  menu: { minWidth: 160, paddingVertical: Spacing.one },
  menuItem: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  menuItemText: { fontSize: 14, fontWeight: '900' },
  mb2: { marginBottom: Spacing.two },
  mb4: { marginBottom: Spacing.four },
  card: { padding: Spacing.four, alignItems: 'center' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, marginBottom: Spacing.two, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: '100%', height: '100%' },
  userName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  handleBadge: { marginTop: Spacing.one, marginBottom: Spacing.two },
  bio: { fontSize: 13, fontWeight: '600', textAlign: 'center', opacity: 0.8, marginVertical: Spacing.one },
  academicPrimary: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  academicSecondary: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: Spacing.two },
  interestsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.one, marginBottom: Spacing.one },
  interestChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  interestChipText: { fontSize: 10, fontWeight: '800' },
  followWrap: { marginTop: Spacing.two, width: '100%' },
  followBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  followText: { fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.four },
  statBox: { flex: 1 },
  statInner: { paddingVertical: Spacing.three, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '800', opacity: 0.6, letterSpacing: 0.5 },
  section: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5, marginBottom: Spacing.two, marginTop: Spacing.two },
  eventRow: { padding: Spacing.three },
  eventRowTitle: { fontSize: 14, fontWeight: '900' },
  eventRowSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  clubTag: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  clubName: { fontSize: 14, fontWeight: '900', color: '#000' },
  roleBadge: { backgroundColor: '#FFF', borderWidth: 1.5, borderRadius: 8, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  roleText: { fontSize: 10, fontWeight: '900', color: '#000' },
  note: { fontSize: 13, fontWeight: '600', marginTop: Spacing.three },
});
