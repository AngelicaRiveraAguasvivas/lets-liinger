import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarBubble } from '@/components/avatar-bubble';
import { CheckinPass } from '@/components/checkin-pass';
import { CheckinScanner } from '@/components/checkin-scanner';
import { EventFormInitialValues, EventFormModal, EventFormSubmitValues } from '@/components/event-form-modal';
import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { categoryColor, categoryLabel } from '@/lib/categories';
import { addToCalendar, saveEvent, shareEvent, unsaveEvent } from '../lib/events';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getFollowingIds, PublicProfile, searchProfiles } from '../lib/follows';
import { checkClean } from '../lib/profanity';
import { checkIn, getCheckedInIds, undoCheckIn } from '../lib/checkin';
import {
  addCoHost, cancelRsvp, EventAttendance, getCoHosts, removeCoHost, rsvpToEvent, summarizeRsvps,
} from '../lib/rsvp';
import { supabase } from '../supabaseClient';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author: string;
  authorId: string;
  authorAvatar: string | null;
}

interface Attendee {
  userId: string;
  label: string;
  avatarUrl: string | null;
}

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_time: string | null;
  hostName: string;
  hostRaw: string | null;
  hostAvatar: string | null;
  postedBy: string;
  created_at: string | null;
  createdBy: string | null;
  latitude: number | null;
  longitude: number | null;
  coverUrl: string | null;
  category: string | null;
  visibility: string | null;
  school: string | null;
  capacity: number | null;
}

export default function EventDetailScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [restrictedSchool, setRestrictedSchool] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [rsvpers, setRsvpers] = useState<Attendee[]>([]);
  const [rsvpedByMe, setRsvpedByMe] = useState(false);
  const [attendance, setAttendance] = useState<EventAttendance>({
    capacity: null, headcount: 0, goingRows: 0, waitlistCount: 0, myStatus: null, myGuests: 0, isFull: false,
  });
  const [guests, setGuests] = useState(0);
  const [coHosts, setCoHosts] = useState<PublicProfile[]>([]);
  const [isCoHost, setIsCoHost] = useState(false);
  const [coHostModal, setCoHostModal] = useState(false);
  const [coHostQuery, setCoHostQuery] = useState('');
  const [coHostResults, setCoHostResults] = useState<PublicProfile[]>([]);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [passVisible, setPassVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [friendsGoing, setFriendsGoing] = useState<string[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [editVisible, setEditVisible] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const [eventRes, likesRes, rsvpsRes, commentsRes, profRes] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, description, location, event_time, host, created_at, created_by, latitude, longitude, cover_url, category, visibility, school, capacity, creator:profiles!events_created_by_fkey(username, display_name, avatar_url)')
        .eq('id', id)
        .single(),
      supabase.from('event_likes').select('user_id').eq('event_id', id),
      supabase
        .from('rsvps')
        .select('user_id, guest_count, status, profile:profiles!rsvps_user_id_fkey(username, display_name, avatar_url)')
        .eq('event_id', id),
      supabase
        .from('event_comments')
        .select('id, content, created_at, user_id, author:profiles!event_comments_user_id_fkey(username, display_name, avatar_url)')
        .eq('event_id', id)
        .order('created_at', { ascending: true }),
      user ? supabase.from('profiles').select('university').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ]);

    const myUniversity = (profRes.data as any)?.university ?? null;

    if (eventRes.data) {
      const e: any = eventRes.data;

      // Defense-in-depth for direct/shared links: RLS is the real
      // enforcement (see supabase/sql/events_school_visibility_rls.sql),
      // this just avoids rendering the full event to a viewer from another
      // school before that lands, or if it's ever misconfigured. The
      // creator can always see their own event, matching the RLS policy's
      // `created_by = auth.uid()` clause.
      const isOwnEvent = !!user && e.created_by === user.id;
      if (e.visibility === 'school' && e.school !== myUniversity && !isOwnEvent) {
        setRestrictedSchool(e.school ?? 'a different school');
        setEvent(null);
        setLoading(false);
        return;
      }
      setRestrictedSchool(null);

      setEvent({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        event_time: e.event_time,
        hostName: e.host?.trim()
          ? e.host
          : e.creator?.username ? `@${e.creator.username}` : e.creator?.display_name ?? 'Someone',
        hostRaw: e.host ?? null,
        hostAvatar: e.creator?.avatar_url ?? null,
        postedBy: e.creator?.username ? `@${e.creator.username}` : e.creator?.display_name ?? 'someone',
        created_at: e.created_at,
        createdBy: e.created_by ?? null,
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        coverUrl: e.cover_url ?? null,
        category: e.category ?? null,
        visibility: e.visibility ?? null,
        school: e.school ?? null,
        capacity: e.capacity ?? null,
      });
    }

    const likes = likesRes.data ?? [];
    setLikeCount(likes.length);
    setLikedByMe(!!user && likes.some((l) => l.user_id === user.id));

    const rsvps = rsvpsRes.data ?? [];
    const cap = (eventRes.data as any)?.capacity ?? null;
    const att = summarizeRsvps(rsvps as any[], cap, user?.id ?? null);
    setAttendance(att);
    setGuests(att.myGuests);
    setRsvpedByMe(att.myStatus !== null);

    // "Who's going" shows confirmed attendees only (waitlisters are counted
    // separately), with a "+N" suffix when they're bringing guests.
    const attendees: Attendee[] = rsvps
      .filter((r: any) => r.status !== 'waitlist')
      .map((r: any) => {
        const base = r.profile?.username ? `@${r.profile.username}` : r.profile?.display_name;
        return {
          userId: r.user_id,
          label: base ? (r.guest_count > 0 ? `${base} +${r.guest_count}` : base) : base,
          avatarUrl: r.profile?.avatar_url ?? null,
        };
      })
      .filter((r) => !!r.label);
    setRsvpers(attendees);

    if (user) {
      const { count } = await supabase
        .from('event_saves')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('event_id', id);
      setSaved((count ?? 0) > 0);
    }

    // Which of the people I follow are going (social proof).
    if (user) {
      const following = await getFollowingIds(user.id);
      setFriendsGoing(attendees.filter((a) => following.has(a.userId)).map((a) => a.label));
    } else {
      setFriendsGoing([]);
    }

    setComments(
      (commentsRes.data ?? []).map((c: any) => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        authorId: c.user_id,
        author: c.author?.username ? `@${c.author.username}` : c.author?.display_name ?? 'Someone',
        authorAvatar: c.author?.avatar_url ?? null,
      }))
    );

    const cohosts = await getCoHosts(id);
    setCoHosts(cohosts);
    setIsCoHost(!!user && cohosts.some((c) => c.id === user.id));
    setCheckedIn(await getCheckedInIds(id));

    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  async function toggleRsvp() {
    if (!userId || !id) return;
    if (attendance.myStatus) await cancelRsvp(id);
    else await rsvpToEvent(id, guests);
    fetchAll();
  }

  async function changeGuests(delta: number) {
    const next = Math.max(0, Math.min(10, guests + delta));
    setGuests(next);
    // If I'm already in, re-submit so capacity/waitlist re-evaluates live.
    if (attendance.myStatus && id) {
      await rsvpToEvent(id, next);
      fetchAll();
    }
  }

  async function handleAddCoHost(u: PublicProfile) {
    if (!id || !userId) return;
    await addCoHost(id, u.id, userId);
    setCoHostModal(false);
    setCoHostQuery('');
    setCoHostResults([]);
    fetchAll();
  }

  async function handleRemoveCoHost(uid: string) {
    if (!id) return;
    await removeCoHost(id, uid);
    fetchAll();
  }

  async function runCoHostSearch(text: string) {
    setCoHostQuery(text);
    const q = text.trim();
    if (!q) { setCoHostResults([]); return; }
    const found = await searchProfiles(q, userId);
    const existing = new Set(coHosts.map((c) => c.id));
    setCoHostResults(found.filter((p) => !existing.has(p.id) && p.id !== event?.createdBy));
  }

  async function toggleCheckin(uid: string) {
    if (!id) return;
    const next = new Set(checkedIn);
    if (next.has(uid)) { next.delete(uid); setCheckedIn(next); await undoCheckIn(id, uid); }
    else { next.add(uid); setCheckedIn(next); await checkIn(id, uid); }
  }

  async function onScanned(uid: string) {
    if (!id) return;
    const next = new Set(checkedIn); next.add(uid); setCheckedIn(next);
    await checkIn(id, uid);
  }

  async function toggleSave() {
    if (!userId || !id) return;
    const next = !saved;
    setSaved(next); // optimistic
    if (next) await saveEvent(userId, id);
    else await unsaveEvent(userId, id);
  }

  async function handleAddToCalendar() {
    if (!event) return;
    const ok = await addToCalendar({
      title: event.title,
      details: event.description,
      location: event.location,
      eventTime: event.event_time,
    });
    if (!ok) { setShareMsg('This event has no date set yet.'); setTimeout(() => setShareMsg(''), 2500); }
  }

  async function handleShare() {
    if (!event || !id) return;
    const result = await shareEvent(id, event.title);
    if (result === 'copied') { setShareMsg('Link copied to clipboard!'); setTimeout(() => setShareMsg(''), 2500); }
    else if (result === 'unsupported') { setShareMsg('Sharing not available here.'); setTimeout(() => setShareMsg(''), 2500); }
  }

  async function toggleLike() {
    if (!userId || !id) return;
    if (likedByMe) {
      await supabase.from('event_likes').delete().eq('event_id', id).eq('user_id', userId);
    } else {
      await supabase.from('event_likes').insert({ event_id: id, user_id: userId });
    }
    fetchAll();
  }

  async function postComment() {
    if (!newComment.trim() || !userId || !id) return;
    const badWord = checkClean(newComment);
    if (badWord) {
      setCommentError(badWord);
      return;
    }
    setCommentError('');
    setPosting(true);
    const { error } = await supabase
      .from('event_comments')
      .insert({ event_id: id, user_id: userId, content: newComment.trim() });
    setPosting(false);
    if (!error) {
      setNewComment('');
      fetchAll();
    }
  }

  const isOwner = !!userId && !!event?.createdBy && userId === event.createdBy;
  const canEdit = isOwner || isCoHost;

  const editInitialValues: EventFormInitialValues | undefined = event
    ? {
        title: event.title,
        description: event.description ?? '',
        host: event.hostRaw ?? '',
        location: event.location,
        eventTime: event.event_time,
        latitude: event.latitude,
        longitude: event.longitude,
        coverUrl: event.coverUrl,
        category: event.category,
        visibility: event.visibility,
        capacity: event.capacity,
      }
    : undefined;

  async function handleEditSubmit(values: EventFormSubmitValues) {
    const { error } = await supabase
      .from('events')
      .update({
        title: values.title,
        description: values.description || null,
        location: values.place.name,
        event_time: values.eventTimeIso,
        host: values.host || null,
        latitude: values.place.lat,
        longitude: values.place.lng,
        cover_url: values.coverUrl,
        category: values.category,
        visibility: values.visibility,
        capacity: values.capacity,
      })
      .eq('id', id);

    if (error) return { error: error.message };
  }

  async function confirmDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError('');
    const { error } = await supabase.from('events').delete().eq('id', id);
    setDeleting(false);
    if (error) {
      setDeleteError(error.message);
      return;
    }
    setDeleteVisible(false);
    router.replace('/');
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: {
      color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900',
      fontSize: 24, letterSpacing: -1,
    },
    actionBtn: {
      flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: 12,
      paddingVertical: Spacing.two, alignItems: 'center',
    },
    commentInput: {
      flex: 1, backgroundColor: colors.backgroundElement, color: colors.text,
      padding: Spacing.three, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 14,
    },
    sendBtn: {
      backgroundColor: colors.accentCyan, borderWidth: 2, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: Spacing.three, justifyContent: 'center',
    },
    commentCard: {
      backgroundColor: colors.backgroundElement, borderWidth: 2, borderColor: colors.border,
      borderRadius: 12, padding: Spacing.three, marginBottom: Spacing.two,
    },
    deleteCard: {
      backgroundColor: colors.backgroundElement, borderWidth: 3, borderColor: colors.border,
      borderRadius: 20, padding: Spacing.four, marginHorizontal: Spacing.four,
    },
    deleteCancelBtn: {
      flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: 12,
      paddingVertical: Spacing.two, alignItems: 'center', backgroundColor: colors.backgroundElement,
    },
    deleteConfirmBtn: {
      flex: 1, borderWidth: 2, borderColor: colors.border, borderRadius: 12,
      paddingVertical: Spacing.two, alignItems: 'center', backgroundColor: colors.accentPink,
    },
  }), [colors]);

  if (loading) {
    return (
      <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.text} /></View>
      </SafeAreaView>
    );
  }

  if (restrictedSchool) {
    return (
      <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ThemedText style={dynamicStyles.headerText}>‹ back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.noteText} themeColor="textSecondary">
            This event is restricted to {restrictedSchool} students.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ThemedText style={dynamicStyles.headerText}>‹ back</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.noteText} themeColor="textSecondary">Event not found.</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn}>
            <ThemedText style={dynamicStyles.headerText}>‹ back</ThemedText>
          </TouchableOpacity>

          {canEdit && (
            <View style={styles.ownerActions}>
              <IconButton emoji="✏️" onPress={() => setEditVisible(true)} />
              {isOwner && <IconButton emoji="🗑️" onPress={() => { setDeleteError(''); setDeleteVisible(true); }} />}
            </View>
          )}
        </View>

        <ShadowSurface
          backgroundColor={colors.backgroundElement}
          radius={20}
          offset={5}
          wrapperStyle={styles.cardShadow}
          style={styles.card}
        >
          {event.coverUrl ? (
            <Image source={{ uri: event.coverUrl }} style={styles.cover} resizeMode="cover" />
          ) : null}
          {categoryLabel(event.category) ? (
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor(event.category), borderColor: colors.border }]}>
              <ThemedText style={styles.categoryBadgeText}>{categoryLabel(event.category)}</ThemedText>
            </View>
          ) : null}
          <ThemedText style={styles.title}>{event.title}</ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaLabel}>HOSTED BY:</ThemedText>
            <TouchableOpacity
              style={styles.hostChip}
              onPress={() => {
                if (event.hostRaw && event.hostRaw.trim()) {
                  router.push(`/club?name=${encodeURIComponent(event.hostRaw.trim())}`);
                } else if (event.createdBy) {
                  router.push(`/user?id=${event.createdBy}`);
                }
              }}
              disabled={!event.hostRaw && (!event.createdBy || event.createdBy === userId)}
              activeOpacity={0.7}
            >
              <AvatarBubble url={event.hostAvatar} name={event.hostName} size={24} />
              <ThemedText style={styles.metaValue}>{event.hostName}</ThemedText>
            </TouchableOpacity>
          </View>

          {(coHosts.length > 0 || isOwner) && (
            <View style={styles.coHostRow}>
              <ThemedText style={styles.metaLabel}>CO-HOSTS:</ThemedText>
              {coHosts.map((c) => (
                <View key={c.id} style={[styles.coHostChip, { borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.hostChip}
                    onPress={() => c.id !== userId && router.push(`/user?id=${c.id}`)}
                    disabled={c.id === userId}
                    activeOpacity={0.7}
                  >
                    <AvatarBubble url={c.avatar_url} name={c.display_name || c.username || '?'} size={20} />
                    <ThemedText style={styles.metaValue}>@{c.username || 'user'}</ThemedText>
                  </TouchableOpacity>
                  {isOwner && (
                    <TouchableOpacity onPress={() => handleRemoveCoHost(c.id)} hitSlop={8}>
                      <ThemedText style={[styles.coHostRemove, { color: colors.accentPink }]}>✕</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {isOwner && (
                <TouchableOpacity
                  style={[styles.addCoHostBtn, { borderColor: colors.border }]}
                  onPress={() => { setCoHostQuery(''); setCoHostResults([]); setCoHostModal(true); }}
                >
                  <ThemedText style={styles.addCoHostText}>＋ Add</ThemedText>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!event.description && (
            <ThemedText style={styles.description}>
              {event.description.split(/(#[A-Za-z0-9_]{1,40})/g).map((part, i) =>
                part.startsWith('#') ? (
                  <ThemedText
                    key={i}
                    style={[styles.hashtag, { color: colors.accentCyan }]}
                    onPress={() => router.push(`/?tag=${encodeURIComponent(part.slice(1).toLowerCase())}` as any)}
                  >
                    {part}
                  </ThemedText>
                ) : (
                  part
                )
              )}
            </ThemedText>
          )}

          <View style={styles.detailItem}>
            <ThemedText style={styles.detailText}>{event.location ?? 'TBD'}</ThemedText>
          </View>
          <View style={styles.detailItem}>
            <ThemedText style={styles.detailText}>{formatEventTime(event.event_time)}</ThemedText>
          </View>
          <View style={styles.detailItem}>
            <ThemedText style={styles.detailText}>
              {attendance.capacity != null
                ? `${attendance.headcount}/${attendance.capacity} spots filled`
                : `${attendance.headcount} going`}
              {attendance.waitlistCount > 0 ? ` · ${attendance.waitlistCount} waitlisted` : ''}
            </ThemedText>
          </View>

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

          {friendsGoing.length > 0 && (
            <ThemedText style={styles.friendsGoing}>
              {friendsSummary(friendsGoing)}
            </ThemedText>
          )}

          <View style={styles.guestRow}>
            <ThemedText style={styles.guestLabel}>Bringing guests?</ThemedText>
            <View style={styles.stepper}>
              <TouchableOpacity style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => changeGuests(-1)}>
                <ThemedText style={styles.stepText}>−</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.guestCount}>{guests}</ThemedText>
              <TouchableOpacity style={[styles.stepBtn, { borderColor: colors.border }]} onPress={() => changeGuests(1)}>
                <ThemedText style={styles.stepText}>＋</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[dynamicStyles.actionBtn, {
                backgroundColor: attendance.myStatus === 'going' ? colors.accentGreen
                  : attendance.myStatus === 'waitlist' ? colors.accentCyan
                  : colors.accentYellow,
              }]}
              onPress={toggleRsvp}
            >
              <ThemedText style={styles.buttonText}>
                {attendance.myStatus === 'going' ? "✓ GOING"
                  : attendance.myStatus === 'waitlist' ? '✓ ON WAITLIST'
                  : attendance.isFull ? 'JOIN WAITLIST' : 'RSVP'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dynamicStyles.actionBtn, { backgroundColor: likedByMe ? colors.accentPink : colors.accentCyan, flex: 0.5 }]}
              onPress={toggleLike}
            >
              <ThemedText style={styles.buttonText}>{likedByMe ? '💖' : '🤍'} {likeCount}</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: saved ? colors.accentYellow : 'transparent' }]}
              onPress={toggleSave}
            >
              <ThemedText style={styles.secondaryText}>{saved ? '★ Saved' : '☆ Save'}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleAddToCalendar}
            >
              <ThemedText style={styles.secondaryText}>Add to calendar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={handleShare}
            >
              <ThemedText style={styles.secondaryText}>Share</ThemedText>
            </TouchableOpacity>
          </View>
          {shareMsg ? (
            <ThemedText style={styles.shareMsg} themeColor="accentCyan">{shareMsg}</ThemedText>
          ) : null}

          {attendance.myStatus === 'going' && !isOwner && !isCoHost ? (
            <TouchableOpacity
              style={[styles.passBtn, { borderColor: colors.border, backgroundColor: colors.accentCyan }]}
              onPress={() => setPassVisible(true)}
            >
              <ThemedText style={styles.buttonText}>Show my check-in pass</ThemedText>
            </TouchableOpacity>
          ) : null}
        </ShadowSurface>

        <ThemedText style={styles.sectionTitle}>WHO&apos;S GOING ({attendance.headcount})</ThemedText>
        {rsvpers.length === 0 ? (
          <ThemedText style={styles.noteText} themeColor="textSecondary">No RSVPs yet — be the first!</ThemedText>
        ) : (
          <View style={styles.rsvpWrap}>
            {rsvpers.map((r) => (
              <TouchableOpacity
                key={r.userId}
                style={[styles.rsvpChip, { backgroundColor: colors.accentGreen, borderColor: colors.border }]}
                onPress={() => r.userId !== userId && router.push(`/user?id=${r.userId}`)}
                disabled={r.userId === userId}
                activeOpacity={0.7}
              >
                <AvatarBubble url={r.avatarUrl} name={r.label} size={22} />
                <ThemedText style={styles.rsvpChipText}>{r.label}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {canEdit && rsvpers.length > 0 && (
          <>
            <View style={styles.checkinHeader}>
              <ThemedText style={styles.sectionTitle}>CHECK-IN ({checkedIn.size}/{attendance.goingRows})</ThemedText>
              <TouchableOpacity
                style={[styles.scanBtn, { borderColor: colors.border, backgroundColor: colors.accentGreen }]}
                onPress={() => setScannerVisible(true)}
              >
                <ThemedText style={styles.scanBtnText}>Scan passes</ThemedText>
              </TouchableOpacity>
            </View>
            {rsvpers.map((r) => {
              const inn = checkedIn.has(r.userId);
              return (
                <TouchableOpacity
                  key={`ci-${r.userId}`}
                  style={[styles.checkinRow, { borderColor: colors.border, backgroundColor: inn ? colors.accentGreen : 'transparent' }]}
                  onPress={() => toggleCheckin(r.userId)}
                  activeOpacity={0.7}
                >
                  <AvatarBubble url={r.avatarUrl} name={r.label} size={26} />
                  <ThemedText style={styles.checkinName} numberOfLines={1}>{r.label}</ThemedText>
                  <ThemedText style={[styles.checkinMark, inn && { color: '#000' }]}>{inn ? '✓ In' : 'Check in'}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <ThemedText style={styles.sectionTitle}>COMMENTS ({comments.length})</ThemedText>

        <View style={styles.commentRow}>
          <TextInput
            style={dynamicStyles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor={colors.textSecondary}
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity style={dynamicStyles.sendBtn} onPress={postComment} disabled={posting}>
            <ThemedText style={styles.buttonText}>{posting ? '...' : 'Send'}</ThemedText>
          </TouchableOpacity>
        </View>

        {commentError ? (
          <ThemedText style={styles.commentError}>{commentError}</ThemedText>
        ) : null}

        {comments.length === 0 ? (
          <ThemedText style={styles.noteText} themeColor="textSecondary">No comments yet. Start the conversation!</ThemedText>
        ) : (
          comments.map((c) => {
            const isMe = c.authorId === userId;
            const openUser = () => !isMe && router.push(`/user?id=${c.authorId}`);
            return (
              <View key={c.id} style={dynamicStyles.commentCard}>
                <View style={styles.commentTopRow}>
                  <TouchableOpacity onPress={openUser} disabled={isMe} activeOpacity={0.7}>
                    <AvatarBubble url={c.authorAvatar} name={c.author} size={34} />
                  </TouchableOpacity>
                  <View style={styles.commentBody}>
                    <TouchableOpacity onPress={openUser} disabled={isMe} activeOpacity={0.7}>
                      <ThemedText style={styles.commentAuthor}>{c.author}</ThemedText>
                    </TouchableOpacity>
                    <ThemedText style={styles.commentText}>{c.content}</ThemedText>
                    <ThemedText style={styles.commentTime} themeColor="textSecondary">{formatEventTime(c.created_at)}</ThemedText>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Delete confirmation */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => setDeleteVisible(false)}>
        <View style={styles.deleteOverlay}>
          <View style={dynamicStyles.deleteCard}>
            <ThemedText style={styles.deleteTitle}>Delete this event?</ThemedText>
            <ThemedText style={styles.deleteBody} themeColor="textSecondary">
              This can&apos;t be undone. RSVPs, likes, and comments will be gone too.
            </ThemedText>
            {deleteError ? <ThemedText style={styles.error}>{deleteError}</ThemedText> : null}
            <View style={styles.deleteActions}>
              <TouchableOpacity
                style={dynamicStyles.deleteCancelBtn}
                onPress={() => setDeleteVisible(false)}
                disabled={deleting}
              >
                <ThemedText style={styles.deleteCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={dynamicStyles.deleteConfirmBtn}
                onPress={confirmDelete}
                disabled={deleting}
              >
                <ThemedText style={styles.buttonText}>{deleting ? 'Deleting...' : 'Delete'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add co-host */}
      <Modal visible={coHostModal} transparent animationType="fade" onRequestClose={() => setCoHostModal(false)}>
        <View style={styles.deleteOverlay}>
          <View style={dynamicStyles.deleteCard}>
            <ThemedText style={styles.deleteTitle}>Add a co-host</ThemedText>
            <ThemedText style={styles.deleteBody} themeColor="textSecondary">Co-hosts can edit this event with you.</ThemedText>
            <TextInput
              style={dynamicStyles.commentInput}
              placeholder="Search @username or name…"
              placeholderTextColor={colors.textSecondary}
              value={coHostQuery}
              onChangeText={runCoHostSearch}
              autoCapitalize="none"
            />
            <View style={styles.coHostResults}>
              {coHostResults.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.coHostResultRow, { borderColor: colors.border }]}
                  onPress={() => handleAddCoHost(p)}
                >
                  <AvatarBubble url={p.avatar_url} name={p.display_name || p.username || '?'} size={28} />
                  <ThemedText style={styles.coHostResultText}>@{p.username || 'user'}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[dynamicStyles.deleteCancelBtn, styles.coHostDone]} onPress={() => setCoHostModal(false)}>
              <ThemedText style={styles.deleteCancelText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {userId && (
        <CheckinPass
          visible={passVisible}
          eventId={event.id}
          userId={userId}
          eventTitle={event.title}
          onClose={() => setPassVisible(false)}
        />
      )}
      <CheckinScanner
        visible={scannerVisible}
        eventId={event.id}
        onClose={() => setScannerVisible(false)}
        onScanned={onScanned}
      />

      <EventFormModal
        visible={editVisible}
        mode="edit"
        initialValues={editInitialValues}
        onClose={() => setEditVisible(false)}
        onSubmit={handleEditSubmit}
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

function friendsSummary(names: string[]): string {
  if (names.length === 1) return `${names[0]} is going`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are going`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more friends are going`;
}

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

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.three,
  },
  backBtn: {},
  ownerActions: { flexDirection: 'row', gap: Spacing.two },
  cardShadow: { marginBottom: Spacing.four },
  card: { padding: Spacing.four },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginBottom: Spacing.three },
  categoryBadge: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, marginBottom: Spacing.one },
  categoryBadgeText: { fontSize: 11, fontWeight: '900', color: '#000' },
  title: { fontSize: 24, fontWeight: '900', lineHeight: 28, marginBottom: Spacing.two },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.two },
  metaLabel: { fontSize: 11, fontWeight: 'bold', opacity: 0.6 },
  metaValue: { fontSize: 12, fontWeight: '900' },
  hostChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  coHostRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  coHostChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: 2, borderRadius: 999, paddingLeft: 3, paddingRight: Spacing.two, paddingVertical: 2 },
  coHostRemove: { fontSize: 13, fontWeight: '900' },
  addCoHostBtn: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  addCoHostText: { fontSize: 12, fontWeight: '900' },
  guestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.three },
  guestLabel: { fontSize: 13, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepBtn: { width: 32, height: 32, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '900' },
  guestCount: { fontSize: 16, fontWeight: '900', minWidth: 18, textAlign: 'center' },
  coHostResults: { marginTop: Spacing.two, gap: Spacing.one },
  coHostResultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 2, borderRadius: 12, padding: Spacing.two },
  coHostResultText: { fontSize: 14, fontWeight: '900' },
  coHostDone: { marginTop: Spacing.three },
  description: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.three, lineHeight: 20 },
  hashtag: { fontWeight: '900' },
  passBtn: { borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.two },
  checkinHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scanBtn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  scanBtnText: { fontSize: 12, fontWeight: '900', color: '#000' },
  checkinRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 2, borderRadius: 12, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, marginBottom: Spacing.two },
  checkinName: { flex: 1, fontSize: 14, fontWeight: '900' },
  checkinMark: { fontSize: 12, fontWeight: '900' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.one },
  detailEmoji: { fontSize: 16 },
  detailText: { fontSize: 13, fontWeight: 'bold' },
  postedText: { fontSize: 12, fontWeight: '700', marginTop: Spacing.two },
  friendsGoing: { fontSize: 13, fontWeight: '900', marginTop: Spacing.two },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  secondaryRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  secondaryBtn: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  secondaryText: { fontSize: 12, fontWeight: '800' },
  shareMsg: { fontSize: 12, fontWeight: '800', marginTop: Spacing.two, textAlign: 'center' },
  buttonText: { fontWeight: '900', color: '#000', fontSize: 14 },
  commentError: { color: '#ff6b6b', fontWeight: '700', fontSize: 12, marginBottom: Spacing.two },
  sectionTitle: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5, marginTop: Spacing.two, marginBottom: Spacing.two },
  noteText: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.three },
  rsvpWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  rsvpChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderWidth: 2, borderRadius: 999, paddingLeft: 3, paddingRight: Spacing.two, paddingVertical: 3 },
  rsvpChipText: { fontSize: 12, fontWeight: '900', color: '#000' },
  commentRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
  commentTopRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  commentBody: { flex: 1 },
  commentAuthor: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  commentText: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  commentTime: { fontSize: 10, fontWeight: '600', marginTop: Spacing.one },
  deleteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center',
  },
  deleteTitle: { fontSize: 18, fontWeight: '900', marginBottom: Spacing.two },
  deleteBody: { fontSize: 13, fontWeight: '600', lineHeight: 19, marginBottom: Spacing.four },
  deleteActions: { flexDirection: 'row', gap: Spacing.two },
  deleteCancelText: { fontWeight: '900', fontSize: 14 },
  error: { color: '#ff6b6b', marginTop: Spacing.three, textAlign: 'center' },
});
