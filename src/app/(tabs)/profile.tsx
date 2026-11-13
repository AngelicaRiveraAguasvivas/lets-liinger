import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GuestProfile } from '@/components/guest';
import { useIsGuest } from '@/hooks/app-prefs-context';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useClubs } from '@/hooks/use-clubs';
import { useTheme } from '@/hooks/use-theme';
import { clubLabel } from '@/lib/clubs';
import { getFollowCounts } from '../../lib/follows';
import { supabase } from '../../supabaseClient';

// Guests see a sample version of this tab instead of real account data.
export default function ProfileScreen() {
  const isGuest = useIsGuest();
  return isGuest ? <GuestProfile /> : <ProfileScreenSigned />;
}

function ProfileScreenSigned() {
  const colors = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState<{
    display_name: string;
    username: string;
    bio: string;
    avatar_url: string | null;
    interests: string[];
    extracurriculars: { name: string; role: string }[];
    university: string | null;
    major: string | null;
    minor: string | null;
    grad_year: string | null;
    cohort: string | null;
  } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savedEvents, setSavedEvents] = useState<{
    id: string;
    title: string;
    host: string;
    location: string;
  }[]>([]);
  const [bookmarked, setBookmarked] = useState<{
    id: string;
    title: string;
    host: string;
    location: string;
  }[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const { clubs, create: createClub } = useClubs();
  const [addingClub, setAddingClub] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubRole, setNewClubRole] = useState('');

  async function saveClubs(next: { name: string; role: string }[]) {
    if (!selfId) return;
    setProfile((p) => (p ? { ...p, extracurriculars: next } : p));
    await supabase.from('profiles').update({ extracurriculars: next }).eq('id', selfId);
  }

  function removeClub(index: number) {
    saveClubs((profile?.extracurriculars ?? []).filter((_, i) => i !== index));
  }

  async function addClubToProfile(name: string, role: string) {
    const clean = name.trim();
    if (!clean) return;
    const existing = profile?.extracurriculars ?? [];
    if (existing.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      setAddingClub(false);
      setNewClubName('');
      setNewClubRole('');
      return;
    }
    await saveClubs([...existing, { name: clean, role: role.trim() || 'Member' }]);
    createClub(clean, ''); // remember it as a suggestion for events + others
    setNewClubName('');
    setNewClubRole('');
    setAddingClub(false);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadingProfile(false);
          return;
        }
        setSelfId(user.id);
        getFollowCounts(user.id).then((c) => { if (!cancelled) setFollowCounts(c); });

        const eventShape = 'event:events!{fk}(id, title, location, creator:profiles!events_created_by_fkey(username, display_name))';
        const [profileRes, rsvpRes, savedRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('display_name, username, bio, avatar_url, interests, extracurriculars, university, major, minor, grad_year, cohort')
            .eq('id', user.id)
            .single(),
          supabase
            .from('rsvps')
            .select(eventShape.replace('{fk}', 'rsvps_event_id_fkey'))
            .eq('user_id', user.id),
          supabase
            .from('event_saves')
            .select(eventShape.replace('{fk}', 'event_saves_event_id_fkey'))
            .eq('user_id', user.id),
        ]);

        if (cancelled) return;

        if (!profileRes.error) {
          setProfile(profileRes.data);
        }

        const toCards = (rows: any[]) =>
          rows
            .map((r: any) => r.event)
            .filter(Boolean)
            .map((e: any) => ({
              id: e.id,
              title: e.title,
              location: e.location ?? 'TBD',
              host: e.creator?.username ? `@${e.creator.username}` : e.creator?.display_name ?? 'Someone',
            }));
        setSavedEvents(toCards(rsvpRes.data ?? []));
        setBookmarked(toCards(savedRes.data ?? []));

        setLoadingProfile(false);
      }

      fetchProfile();
      return () => { cancelled = true; };
    }, [])
  );

  const clubColors = [colors.accentPink, colors.accentCyan, colors.accentYellow, colors.accentGreen];

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerText: {
      color: colors.text,
      fontFamily: 'ui-rounded',
      fontWeight: '900',
      fontSize: 28,
      letterSpacing: -1,
    },
    avatarContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 3,
      borderColor: colors.border,
      backgroundColor: colors.accentYellow,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.two,
      overflow: 'hidden',
    },
  }), [colors]);

  if (loadingProfile) {
    return (
      <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <ThemedText style={dynamicStyles.headerText}>my profile</ThemedText>
          <View style={styles.headerActions}>
            <IconButton icon={require('@/assets/images/icons/search.png')} accessibilityLabel="Search" onPress={() => router.push('/search')} />
            <IconButton emoji="⚙️" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <ShadowSurface backgroundColor={colors.backgroundElement} radius={24} offset={6} wrapperStyle={styles.profileCardShadow} style={styles.profileCard}>
          <View style={dynamicStyles.avatarContainer}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} resizeMode="cover" />
            ) : null}
          </View>

          <ThemedText style={styles.userName}>
            {(profile?.display_name || 'New Student').toUpperCase()}
          </ThemedText>

          <Badge label={`@${profile?.username || 'username'}`} backgroundColor={colors.accentCyan} radius={12} style={styles.handleBadge} />

          {(profile?.grad_year || profile?.university) && (
            <ThemedText style={styles.academicPrimary} themeColor="textSecondary">
              {[profile?.grad_year ? `Class of ${profile.grad_year}` : null, profile?.university]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          )}
          {(profile?.major || profile?.minor || profile?.cohort) && (
            <ThemedText style={styles.academicSecondary} themeColor="textSecondary">
              {[
                profile?.major,
                profile?.minor ? `Minor in ${profile.minor}` : null,
                profile?.cohort,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          )}

          <View style={styles.followRow}>
            <TouchableOpacity
              style={styles.followStat}
              onPress={() => selfId && router.push(`/connections?userId=${selfId}&type=followers`)}
            >
              <ThemedText style={styles.followNum}>{followCounts.followers}</ThemedText>
              <ThemedText style={styles.followLabel} themeColor="textSecondary">Followers</ThemedText>
            </TouchableOpacity>
            <View style={[styles.followDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.followStat}
              onPress={() => selfId && router.push(`/connections?userId=${selfId}&type=following`)}
            >
              <ThemedText style={styles.followNum}>{followCounts.following}</ThemedText>
              <ThemedText style={styles.followLabel} themeColor="textSecondary">Following</ThemedText>
            </TouchableOpacity>
          </View>

          <ThemedText style={styles.bioText}>
            {profile?.bio || 'No bio yet.'}
          </ThemedText>

          {!!profile?.interests?.length && (
            <View style={styles.interestsWrap}>
              {profile.interests.map((tag) => (
                <View key={tag} style={[styles.interestChip, { borderColor: colors.border }]}>
                  <ThemedText style={styles.interestChipText}>{tag}</ThemedText>
                </View>
              ))}
            </View>
          )}

          <ShadowSurface
            backgroundColor={colors.accentPink}
            radius={14}
            offset={3}
            wrapperStyle={styles.editBtnShadow}
            style={styles.editBtn}
            onPress={() => router.push('/edit-profile')}
          >
            <ThemedText style={styles.boldBtnText}>EDIT PROFILE</ThemedText>
          </ShadowSurface>
        </ShadowSurface>

        <View style={styles.statsRow}>
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.statBoxShadow} style={styles.statBox}>
            <ThemedText style={styles.statNumber}>{savedEvents.length}</ThemedText>
            <ThemedText style={styles.statLabel}>RSVPS</ThemedText>
          </ShadowSurface>

          <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.statBoxShadow} style={styles.statBox}>
            <ThemedText style={styles.statNumber}>{profile?.extracurriculars?.length ?? 0}</ThemedText>
            <ThemedText style={styles.statLabel}>CLUBS</ThemedText>
          </ShadowSurface>
        </View>

        <ShadowSurface
          backgroundColor={colors.accentYellow}
          radius={14}
          offset={4}
          wrapperStyle={styles.insightsBtnShadow}
          style={styles.insightsBtn}
          onPress={() => router.push('/insights')}
        >
          <ThemedText style={styles.insightsBtnText}>MY EVENT INSIGHTS</ThemedText>
        </ShadowSurface>

        <View style={styles.clubsHeader}>
          <ThemedText style={styles.sectionTitle}>MY CLUBS</ThemedText>
          <TouchableOpacity onPress={() => setAddingClub((v) => !v)}>
            <ThemedText style={[styles.addClubLink, { color: colors.accentCyan }]}>
              {addingClub ? 'Close' : '＋ Add'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {addingClub && (
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={14} offset={3} borderWidth={2} wrapperStyle={styles.addClubShadow} style={styles.addClubCard}>
            {clubs.length > 0 && (
              <View style={styles.suggestWrap}>
                {clubs.map((c) => (
                  <Chip key={c.id} label={clubLabel(c)} selected={newClubName === c.name} onPress={() => setNewClubName(c.name)} />
                ))}
              </View>
            )}
            <TextField placeholder="Club or org name" value={newClubName} onChangeText={setNewClubName} containerStyle={styles.addClubField} />
            <TextField placeholder="Your role" value={newClubRole} onChangeText={setNewClubRole} containerStyle={styles.addClubField} />
            <ShadowSurface backgroundColor={colors.accentGreen} radius={12} offset={3} wrapperStyle={styles.addClubBtnShadow} style={styles.addClubBtn} onPress={() => addClubToProfile(newClubName, newClubRole)}>
              <ThemedText style={styles.addClubBtnText}>Add to my clubs</ThemedText>
            </ShadowSurface>
          </ShadowSurface>
        )}

        {!profile?.extracurriculars?.length && !addingClub && (
          <ThemedText style={styles.emptyText} themeColor="textSecondary">
            No clubs yet. Tap ＋ Add to join one.
          </ThemedText>
        )}

        {profile?.extracurriculars?.map((club, index) => (
          <ShadowSurface
            key={`${club.name}-${index}`}
            backgroundColor={clubColors[index % clubColors.length]}
            radius={14}
            offset={3}
            wrapperStyle={styles.clubTagShadow}
            style={styles.clubTag}
          >
            <ThemedText style={styles.clubNameText} numberOfLines={1}>{club.name}</ThemedText>
            <View style={styles.clubRight}>
              <View style={[styles.roleBadge, { borderColor: colors.border }]}>
                <ThemedText style={styles.roleText}>{club.role}</ThemedText>
              </View>
              <TouchableOpacity onPress={() => removeClub(index)} hitSlop={8}>
                <ThemedText style={styles.removeClubText}>✕</ThemedText>
              </TouchableOpacity>
            </View>
          </ShadowSurface>
        ))}

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>MY ACTIVITY</ThemedText>
        </View>

        {savedEvents.length === 0 && (
          <ThemedText style={styles.emptyText} themeColor="textSecondary">
            No RSVPs yet. RSVP to events from the home feed.
          </ThemedText>
        )}

        {savedEvents.map((event) => (
          <ShadowSurface
            key={event.id}
            backgroundColor={colors.backgroundElement}
            radius={16}
            offset={4}
            borderWidth={2}
            wrapperStyle={styles.eventCardShadow}
            style={styles.eventCard}
            onPress={() => router.push(`/event-detail?id=${event.id}`)}
          >
            <Badge label="RSVP'D" backgroundColor={colors.accentGreen} style={styles.statusBadge} />
            <ThemedText style={styles.eventTitle}>{event.title}</ThemedText>
            <ThemedText style={styles.eventMeta}>Hosted by {event.host} • {event.location}</ThemedText>
          </ShadowSurface>
        ))}

        {bookmarked.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>SAVED</ThemedText>
            </View>
            {bookmarked.map((event) => (
              <ShadowSurface
                key={event.id}
                backgroundColor={colors.backgroundElement}
                radius={16}
                offset={4}
                borderWidth={2}
                wrapperStyle={styles.eventCardShadow}
                style={styles.eventCard}
                onPress={() => router.push(`/event-detail?id=${event.id}`)}
              >
                <Badge label="★ SAVED" backgroundColor={colors.accentYellow} style={styles.statusBadge} />
                <ThemedText style={styles.eventTitle}>{event.title}</ThemedText>
                <ThemedText style={styles.eventMeta}>Hosted by {event.host} • {event.location}</ThemedText>
              </ShadowSurface>
            ))}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 130,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileCardShadow: { marginBottom: Spacing.four },
  profileCard: { padding: Spacing.four, alignItems: 'center' },
  handleBadge: { marginTop: Spacing.one, marginBottom: Spacing.two, alignSelf: 'center' },
  academicPrimary: { fontSize: 13, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  academicSecondary: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: Spacing.two },
  followRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  followStat: { alignItems: 'center', paddingHorizontal: Spacing.four },
  followDivider: { width: 2, height: 28, opacity: 0.5 },
  followNum: { fontSize: 18, fontWeight: '900' },
  followLabel: { fontSize: 11, fontWeight: '700' },
  userName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bioText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.8,
    marginVertical: Spacing.one,
  },
  interestsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  interestChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  interestChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  editBtnShadow: { marginTop: Spacing.two, width: '100%' },
  editBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  boldBtnText: {
    fontWeight: '900',
    color: '#000',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  statBoxShadow: { flex: 1 },
  statBox: { paddingVertical: Spacing.two, alignItems: 'center' },
  insightsBtnShadow: { marginBottom: Spacing.four },
  insightsBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  insightsBtnText: { fontWeight: '900', color: '#000', fontSize: 14, letterSpacing: 0.5 },
  statNumber: {
    fontSize: 20,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.6,
  },
  sectionHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.two,
  },
  clubsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.two, marginBottom: Spacing.two,
  },
  addClubLink: { fontSize: 14, fontWeight: '900' },
  addClubShadow: { marginBottom: Spacing.three },
  addClubCard: { padding: Spacing.three },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.two },
  addClubField: { marginBottom: Spacing.two },
  addClubBtnShadow: { marginTop: Spacing.one },
  addClubBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  addClubBtnText: { fontWeight: '900', color: '#000', fontSize: 13 },
  clubTagShadow: { marginBottom: Spacing.two },
  clubTag: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  clubRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  removeClubText: { fontSize: 14, fontWeight: '900', color: '#000' },
  clubNameText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
    flex: 1,
    marginRight: Spacing.two,
  },
  roleBadge: {
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
  },
  statusBadge: { marginBottom: Spacing.one },
  eventCardShadow: { marginBottom: Spacing.two },
  eventCard: { padding: Spacing.three },
  eventTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  eventMeta: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.6,
  },
  menuBackdrop: {
    flex: 1,
    alignItems: 'flex-end',
  },
  menuShadow: { marginTop: 60, marginRight: Spacing.four },
  menu: { minWidth: 160, paddingVertical: Spacing.one },
  menuItem: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '900',
  },
});
