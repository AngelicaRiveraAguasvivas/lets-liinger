import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { EventFormModal, EventFormSubmitValues } from '@/components/event-form-modal';
import { EventCardSkeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useNotifications } from '@/hooks/notifications-context';
import { useTheme } from '@/hooks/use-theme';
import { useUserCoords } from '@/hooks/use-user-coords';
import { EVENT_CATEGORIES, categoryColor, categoryLabel } from '@/lib/categories';
import { getUnreadNotificationCount } from '@/lib/notifications';
import { getFollowingIds } from '../../lib/follows';
import { getBlockedIds } from '../../lib/moderation';
import type { Coords } from '../../lib/places';
import { supabase } from '../../supabaseClient';

type SortMode = 'upcoming' | 'popular' | 'recent' | 'nearby';

function eventTimeMs(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.getTime();
}

interface EnrichedEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_time: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  hostName: string;
  postedBy: string;
  createdBy: string | null;
  likeCount: number;
  likedByMe: boolean;
  rsvpCount: number;
  rsvpers: string[];
  rsvpedByMe: boolean;
  distance: number | null;
  coverUrl: string | null;
  category: string | null;
  school: string | null;
  visibility: string | null;
}

// "Posted 3h ago" style relative label.
function formatPosted(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Haversine distance in km between two coordinates.
function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Human-readable distance in miles (feet when very close).
function milesAway(km: number): string {
  const miles = km * 0.621371;
  return miles < 0.1
    ? `${Math.round(miles * 5280)} ft away`
    : `${miles.toFixed(1)} mi away`;
}

// `event_time` is stored as a naive local timestamp (no timezone — see
// toEventTimeIso in event-form-modal.tsx), so "now" for comparison has to be
// built the same way instead of via toISOString(), which would shift by the
// device's UTC offset and mis-filter events near the day boundary.
function nowAsNaiveTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const PAGE_SIZE = 20;

export default function HomeScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { markEventsSeen } = useNotifications();
  const { coords: userCoords, request: requestUserCoords } = useUserCoords(false);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('upcoming');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [myUniversity, setMyUniversity] = useState<string | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [createVisible, setCreateVisible] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    // Default to upcoming events only (plus ones with no time set yet); page
    // through the rest with `limit` instead of pulling the whole table.
    let eventsQuery = supabase
      .from('events')
      .select(
        'id, title, description, location, event_time, latitude, longitude, created_at, host, created_by, cover_url, category, school, visibility, creator:profiles!events_created_by_fkey(username, display_name)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(0, limit - 1);

    if (!showPast) {
      eventsQuery = eventsQuery.or(`event_time.is.null,event_time.gte.${nowAsNaiveTimestamp()}`);
    }

    const [eventsRes, following, blocked, unread] = await Promise.all([
      eventsQuery,
      user ? getFollowingIds(user.id) : Promise.resolve(new Set<string>()),
      user ? getBlockedIds(user.id) : Promise.resolve(new Set<string>()),
      user ? getUnreadNotificationCount(user.id) : Promise.resolve(0),
    ]);

    setFollowingIds(following);
    setUnreadNotifs(unread);

    if (user) {
      const { data: prof } = await supabase.from('profiles').select('university').eq('id', user.id).single();
      const uni = (prof as any)?.university ?? null;
      setMyUniversity(uni);
      if (!uni) setScope('all'); // no school set → nothing to scope to
    }

    // Hide events posted by people you've blocked (or who blocked you).
    const rawEvents = (eventsRes.data ?? []).filter((e: any) => !e.created_by || !blocked.has(e.created_by));
    setHasMore((eventsRes.count ?? 0) > limit);

    // Likes/RSVPs only need to cover the events actually on this page.
    const eventIds = rawEvents.map((e: any) => e.id);
    const [likesRes, rsvpsRes] = eventIds.length
      ? await Promise.all([
          supabase.from('event_likes').select('event_id, user_id').in('event_id', eventIds),
          supabase
            .from('rsvps')
            .select('event_id, user_id, profile:profiles!rsvps_user_id_fkey(username, display_name)')
            .in('event_id', eventIds),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];
    const likes = likesRes.data ?? [];
    const rsvps = rsvpsRes.data ?? [];

    const enriched: EnrichedEvent[] = rawEvents.map((e: any) => {
      const eventLikes = likes.filter((l) => l.event_id === e.id);
      const eventRsvps = rsvps.filter((r) => r.event_id === e.id);
      const hasCoords = e.latitude != null && e.longitude != null;

      return {
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        event_time: e.event_time,
        latitude: e.latitude,
        longitude: e.longitude,
        created_at: e.created_at,
        hostName: e.host?.trim()
          ? e.host
          : e.creator?.username
            ? `@${e.creator.username}`
            : e.creator?.display_name ?? 'Someone',
        postedBy: e.creator?.username ? `@${e.creator.username}` : e.creator?.display_name ?? 'someone',
        createdBy: e.created_by ?? null,
        likeCount: eventLikes.length,
        likedByMe: !!user && eventLikes.some((l) => l.user_id === user.id),
        rsvpCount: eventRsvps.length,
        rsvpers: eventRsvps
          .map((r: any) => r.profile?.username)
          .filter(Boolean)
          .map((u: string) => `@${u}`),
        rsvpedByMe: !!user && eventRsvps.some((r) => r.user_id === user.id),
        distance:
          hasCoords && userCoords
            ? distanceKm(userCoords, { lat: e.latitude, lng: e.longitude })
            : null,
        coverUrl: e.cover_url ?? null,
        category: e.category ?? null,
        school: e.school ?? null,
        visibility: e.visibility ?? null,
      };
    });

    setEvents(enriched);
    setLoading(false);
    setLoadingMore(false);
  }, [userCoords, limit, showPast]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      markEventsSeen(); // viewing the home feed clears the new-events dot
    }, [fetchAll, markEventsSeen])
  );

  function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLimit((l) => l + PAGE_SIZE);
  }

  function togglePast() {
    setLimit(PAGE_SIZE);
    setShowPast((v) => !v);
  }

  // Optimistic: flip local state immediately, hit the DB in the background,
  // and roll back only if the write actually fails. Avoids refetching every
  // event/like/rsvp in the feed for a single-row change.
  async function toggleRsvp(ev: EnrichedEvent) {
    if (!userId) return;
    const wasRsvped = ev.rsvpedByMe;
    const prevEvents = events;

    setEvents((prev) =>
      prev.map((e) =>
        e.id === ev.id
          ? { ...e, rsvpedByMe: !wasRsvped, rsvpCount: e.rsvpCount + (wasRsvped ? -1 : 1) }
          : e
      )
    );

    const { error } = wasRsvped
      ? await supabase.from('rsvps').delete().eq('event_id', ev.id).eq('user_id', userId)
      : await supabase.from('rsvps').insert({ event_id: ev.id, user_id: userId });

    if (error) setEvents(prevEvents);
  }

  async function toggleLike(ev: EnrichedEvent) {
    if (!userId) return;
    const wasLiked = ev.likedByMe;
    const prevEvents = events;

    setEvents((prev) =>
      prev.map((e) =>
        e.id === ev.id
          ? { ...e, likedByMe: !wasLiked, likeCount: e.likeCount + (wasLiked ? -1 : 1) }
          : e
      )
    );

    const { error } = wasLiked
      ? await supabase.from('event_likes').delete().eq('event_id', ev.id).eq('user_id', userId)
      : await supabase.from('event_likes').insert({ event_id: ev.id, user_id: userId });

    if (error) setEvents(prevEvents);
  }

  async function handleCreateSubmit(values: EventFormSubmitValues) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'You need to be signed in.' };

    // Stamp the event with the creator's school so it can be school-scoped.
    const { data: prof } = await supabase.from('profiles').select('university').eq('id', user.id).single();
    const school = (prof as any)?.university ?? null;

    const { error } = await supabase.from('events').insert({
      title: values.title,
      description: values.description || null,
      location: values.place.name,
      event_time: values.eventTimeIso,
      created_by: user.id,
      host: values.host || null,
      latitude: values.place.lat,
      longitude: values.place.lng,
      cover_url: values.coverUrl,
      category: values.category,
      visibility: values.visibility,
      school,
    });

    if (error) return { error: error.message };
  }

  async function enableNearby() {
    if (!userCoords) await requestUserCoords();
    setSortMode('nearby');
  }

  // Filter + sort for display
  const visibleEvents = events
    // "My school only" events are hidden from every other school regardless
    // of the mine/all scope toggle — that toggle is just the viewer's own
    // feed preference, not a bypass for another school's private events.
    .filter((e) => (e.visibility === 'school' ? e.school === myUniversity || e.createdBy === userId : true))
    .filter((e) => (scope === 'mine' && myUniversity ? e.school === myUniversity : true))
    .filter((e) => (followingOnly ? !!e.createdBy && followingIds.has(e.createdBy) : true))
    .filter((e) => (categoryFilter ? e.category === categoryFilter : true))
    .filter((e) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q) ||
        e.hostName.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortMode === 'upcoming') {
        const now = Date.now();
        const ta = eventTimeMs(a.event_time);
        const tb = eventTimeMs(b.event_time);
        const aFuture = ta != null && ta >= now;
        const bFuture = tb != null && tb >= now;
        if (aFuture && bFuture) return ta! - tb!;   // soonest upcoming first
        if (aFuture) return -1;
        if (bFuture) return 1;
        if (ta != null && tb != null) return tb - ta; // then most recent past
        return b.created_at.localeCompare(a.created_at);
      }
      if (sortMode === 'popular') {
        if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
        return b.created_at.localeCompare(a.created_at);
      }
      if (sortMode === 'nearby') {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      }
      // recent
      return b.created_at.localeCompare(a.created_at);
    });

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: {
      color: colors.text, fontFamily: 'Helvetica', fontWeight: '900',
      fontSize: 32, letterSpacing: -1,
    },
    input: {
      flex: 1, paddingHorizontal: Spacing.two, fontSize: 15,
      fontWeight: 'bold', color: colors.text,
    },
    searchBtn: {
      backgroundColor: colors.accentCyan, padding: Spacing.two,
      borderRadius: 10, borderWidth: 2, borderColor: colors.border,
    },
    actionBtn: {
      flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: 12,
      paddingVertical: Spacing.two, alignItems: 'center',
    },
  }), [colors]);

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'recent', label: 'Recent' },
    { key: 'popular', label: 'Popular' },
    { key: 'nearby', label: 'Nearby' },
  ];

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText style={dynamicStyles.headerText}>LetsLiinger</ThemedText>
          <View style={styles.headerActions}>
            <IconButton icon={require('@/assets/images/icons/search.png')} size={20} onPress={() => router.push('/search')} />
            <View>
              <IconButton icon={require('@/assets/images/icons/bell.png')} size={20} onPress={() => router.push('/notifications')} />
              {unreadNotifs > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.accentPink, borderColor: colors.border }]}>
                  <ThemedText style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</ThemedText>
                </View>
              )}
            </View>
          </View>
        </View>

        <ShadowSurface
          backgroundColor={colors.backgroundElement}
          radius={16}
          offset={4}
          wrapperStyle={styles.searchShadow}
          style={styles.searchContainer}
        >
          <ThemedText style={styles.searchIcon}>🔍</ThemedText>
          <TextInput
            style={dynamicStyles.input}
            placeholder="Search events…"
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={dynamicStyles.searchBtn} onPress={() => setSearchQuery('')}>
              <ThemedText style={styles.boldText}>✕</ThemedText>
            </TouchableOpacity>
          )}
        </ShadowSurface>

        <ShadowSurface
          backgroundColor={colors.accentGreen}
          radius={14}
          offset={3}
          wrapperStyle={styles.createShadow}
          style={styles.createBtn}
          onPress={() => setCreateVisible(true)}
        >
          <ThemedText style={styles.boldText}>+ CREATE EVENT</ThemedText>
        </ShadowSurface>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortRowScroll}
          contentContainerStyle={styles.sortRow}
        >
          {sortOptions.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              selected={sortMode === opt.key}
              onPress={() => (opt.key === 'nearby' ? enableNearby() : setSortMode(opt.key))}
            />
          ))}
          <Chip
            label="Past"
            selected={showPast}
            selectedColor={colors.accentCyan}
            onPress={togglePast}
          />
          <Chip
            label="Following"
            selected={followingOnly}
            selectedColor={colors.accentGreen}
            onPress={() => setFollowingOnly((v) => !v)}
            style={styles.followingChip}
          />
        </ScrollView>

        <View style={styles.scopeRow}>
          <TouchableOpacity
            onPress={() => setScope('mine')}
            disabled={!myUniversity}
            style={[styles.scopeChip, { borderColor: colors.border, backgroundColor: scope === 'mine' ? colors.accentGreen : 'transparent', opacity: myUniversity ? 1 : 0.4 }]}
          >
            <ThemedText style={[styles.scopeText, scope === 'mine' && { color: '#000' }]}>
              {myUniversity ? 'My school' : 'Set your school'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setScope('all')}
            style={[styles.scopeChip, { borderColor: colors.border, backgroundColor: scope === 'all' ? colors.accentCyan : 'transparent' }]}
          >
            <ThemedText style={[styles.scopeText, scope === 'all' && { color: '#000' }]}>All schools</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortRowScroll}
          contentContainerStyle={styles.sortRow}
        >
          <TouchableOpacity
            onPress={() => setCategoryFilter(null)}
            style={[styles.catFilterChip, { borderColor: colors.border, backgroundColor: categoryFilter === null ? colors.accentPink : 'transparent' }]}
          >
            <ThemedText style={styles.catFilterText}>All</ThemedText>
          </TouchableOpacity>
          {EVENT_CATEGORIES.map((c) => {
            const on = categoryFilter === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategoryFilter(on ? null : c.key)}
                style={[styles.catFilterChip, { borderColor: colors.border, backgroundColor: on ? c.color : 'transparent' }]}
              >
                <View style={[styles.catFilterDot, { backgroundColor: c.color, borderColor: colors.border }]} />
                <ThemedText style={[styles.catFilterText, on && { color: '#000' }]}>{c.label}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {sortMode === 'nearby' && !userCoords && (
          <ThemedText style={styles.noteText} themeColor="textSecondary">
            Location unavailable — showing events with coordinates first.
          </ThemedText>
        )}

        {loading ? (
          <View>
            <EventCardSkeleton />
            <EventCardSkeleton />
            <EventCardSkeleton />
          </View>
        ) : visibleEvents.length === 0 ? (
          <EmptyState
            title={
              categoryFilter
                ? 'No events in this category'
                : followingOnly
                  ? 'No events from people you follow'
                  : 'No events yet'
            }
            subtitle={
              followingOnly
                ? 'Follow classmates to see their events here.'
                : 'Tap “+ CREATE EVENT” to add the first one!'
            }
          />
        ) : (
          visibleEvents.map((event) => (
            <ShadowSurface
              key={event.id}
              backgroundColor={colors.backgroundElement}
              radius={20}
              offset={6}
              wrapperStyle={styles.cardShadow}
              style={styles.card}
              onPress={() => router.push(`/event-detail?id=${event.id}`)}
            >
              {event.coverUrl ? (
                <Image source={{ uri: event.coverUrl }} style={styles.cardCover} resizeMode="cover" />
              ) : null}
              {categoryLabel(event.category) ? (
                <View style={[styles.cardCategory, { backgroundColor: categoryColor(event.category), borderColor: colors.border }]}>
                  <ThemedText style={styles.cardCategoryText}>{categoryLabel(event.category)}</ThemedText>
                </View>
              ) : null}
              <ThemedText style={styles.eventTitle}>{event.title}</ThemedText>

              <View style={styles.metaRow}>
                <ThemedText style={styles.metaLabel}>HOSTED BY:</ThemedText>
                {event.hostName.startsWith('@') ? (
                  <ThemedText style={styles.metaValue}>{event.hostName}</ThemedText>
                ) : (
                  <TouchableOpacity onPress={() => router.push(`/club?name=${encodeURIComponent(event.hostName)}`)}>
                    <ThemedText style={[styles.metaValue, { color: colors.accentCyan }]}>{event.hostName}</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.detailItem}>
                <ThemedText style={styles.detailText}>{event.location ?? 'TBD'}</ThemedText>
              </View>

              <View style={styles.detailItem}>
                <ThemedText style={styles.detailText}>
                  {formatEventTime(event.event_time)}
                </ThemedText>
              </View>

              {sortMode === 'nearby' && event.distance != null && (
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailText}>
                    {milesAway(event.distance)}
                  </ThemedText>
                </View>
              )}

              {event.rsvpCount > 0 && (
                <ThemedText style={styles.rsvpLine} themeColor="textSecondary">
                  {rsvpSummary(event.rsvpers, event.rsvpCount)}
                </ThemedText>
              )}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[
                    dynamicStyles.actionBtn,
                    { backgroundColor: event.rsvpedByMe ? colors.accentGreen : colors.accentYellow },
                  ]}
                  onPress={() => toggleRsvp(event)}
                >
                  <ThemedText style={styles.buttonText}>
                    {event.rsvpedByMe ? "✓ RSVP'D!" : 'RSVP'}
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    dynamicStyles.actionBtn,
                    { backgroundColor: event.likedByMe ? colors.accentPink : colors.accentCyan, flex: 0.5 },
                  ]}
                  onPress={() => toggleLike(event)}
                >
                  <ThemedText style={styles.buttonText}>
                    {event.likedByMe ? '💖' : '🤍'} {event.likeCount}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.cardFooter}>
                {event.createdBy && event.createdBy !== userId ? (
                  <TouchableOpacity onPress={() => router.push(`/user?id=${event.createdBy}`)}>
                    <ThemedText style={styles.postedText} themeColor="textSecondary">
                      Posted {formatPosted(event.created_at)} by {event.postedBy}
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <ThemedText style={styles.postedText} themeColor="textSecondary">
                    Posted {formatPosted(event.created_at)} by {event.postedBy}
                  </ThemedText>
                )}
                <ThemedText style={styles.commentHint} themeColor="textSecondary">
                  Tap to view & comment →
                </ThemedText>
              </View>
            </ShadowSurface>
          ))
        )}

        {!loading && hasMore && (
          <TouchableOpacity
            style={[styles.loadMoreBtn, { borderColor: colors.border }]}
            onPress={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <ThemedText style={styles.loadMoreText}>Load more events</ThemedText>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <EventFormModal
        visible={createVisible}
        mode="create"
        onClose={() => setCreateVisible(false)}
        onSubmit={handleCreateSubmit}
        onSuccess={fetchAll}
      />
    </SafeAreaView>
  );
}

function formatEventTime(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const hasTime = iso.includes('T') && !iso.endsWith('T00:00:00');
  if (!hasTime) return date;
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function rsvpSummary(usernames: string[], count: number): string {
  if (usernames.length === 0) return `${count} going`;
  const shown = usernames.slice(0, 3).join(', ');
  const extra = count - Math.min(usernames.length, 3);
  return extra > 0 ? `${shown} +${extra} going` : `${shown} going`;
}

const styles = StyleSheet.create({
  scrollContent: { padding: Spacing.four, paddingBottom: 130 },
  loadingWrap: { paddingVertical: Spacing.six, alignItems: 'center' },
  cardCover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginBottom: Spacing.two },
  cardCategory: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, marginBottom: Spacing.one },
  cardCategoryText: { fontSize: 10, fontWeight: '900', color: '#000' },
  scopeRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  scopeChip: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center' },
  scopeText: { fontSize: 13, fontWeight: '900' },
  catFilterChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 5 },
  catFilterDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  catFilterText: { fontSize: 12, fontWeight: '800' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.two,
  },
  boldText: { fontWeight: '900', color: '#000', fontSize: 14 },
  headerActions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  searchShadow: { marginTop: Spacing.two, marginBottom: Spacing.three },
  searchContainer: { flexDirection: 'row', alignItems: 'center', padding: Spacing.one },
  searchIcon: { fontSize: 15, paddingLeft: Spacing.two },
  createShadow: { marginBottom: Spacing.three },
  createBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  sortRowScroll: { marginBottom: Spacing.three },
  sortRow: { flexDirection: 'row', gap: Spacing.two, flexGrow: 1 },
  followingChip: { marginLeft: 'auto' },
  noteText: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.three },
  cardShadow: { marginBottom: Spacing.four },
  card: { padding: Spacing.three },
  eventTitle: { fontSize: 22, fontWeight: '900', lineHeight: 26, marginBottom: Spacing.one },
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.one, marginBottom: Spacing.two,
  },
  metaLabel: { fontSize: 11, fontWeight: 'bold', opacity: 0.6 },
  metaValue: { fontSize: 12, fontWeight: '900' },
  detailItem: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.one, marginBottom: Spacing.one,
  },
  detailEmoji: { fontSize: 16 },
  detailText: { fontSize: 13, fontWeight: 'bold' },
  rsvpLine: { fontSize: 12, fontWeight: '700', marginTop: Spacing.one, marginBottom: Spacing.two },
  cardActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  buttonText: { fontWeight: '900', color: '#000', fontSize: 14 },
  commentHint: { fontSize: 11, fontWeight: '700' },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '900', color: '#000' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.two, gap: Spacing.two, flexWrap: 'wrap',
  },
  postedText: { fontSize: 11, fontWeight: '700' },
  loadMoreBtn: {
    borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two,
    alignItems: 'center', marginTop: Spacing.two,
  },
  loadMoreText: { fontSize: 13, fontWeight: '900' },
});
