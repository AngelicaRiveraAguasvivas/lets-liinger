import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryColor, categoryLabel } from '@/lib/categories';
import {
  Club, fetchClubByName, fetchClubEvents, followClub, isFollowingClub, unfollowClub,
} from '@/lib/clubs';
import { supabase } from '../supabaseClient';

function formatWhen(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ClubScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const clubName = (name ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!clubName) { setLoading(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        setSelfId(user?.id ?? null);
        const [c, evs, isF] = await Promise.all([
          fetchClubByName(clubName),
          fetchClubEvents(clubName),
          user ? isFollowingClub(user.id, clubName) : Promise.resolve(false),
        ]);
        if (cancelled) return;
        setClub(c);
        setEvents(evs);
        setFollowing(isF);
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [clubName])
  );

  async function toggleFollow() {
    if (!selfId || busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    if (next) await followClub(selfId, clubName);
    else await unfollowClub(selfId, clubName);
    setBusy(false);
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    headerText: { color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  }), [colors]);

  const emoji = club?.emoji || '🏷️';

  return (
    <SafeAreaView style={dynamicStyles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn}>
          <ThemedText style={dynamicStyles.headerText}>‹ back</ThemedText>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color={colors.text} style={{ marginTop: Spacing.six }} />
        ) : (
          <>
            <View style={styles.headerCard}>
              <View style={[styles.emojiCircle, { borderColor: colors.border, backgroundColor: colors.accentYellow }]}>
                <ThemedText style={styles.emoji}>{emoji}</ThemedText>
              </View>
              <ThemedText style={styles.clubName}>{clubName}</ThemedText>
              <ThemedText style={styles.count} themeColor="textSecondary">
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </ThemedText>

              {selfId ? (
                <ShadowSurface
                  backgroundColor={following ? colors.backgroundElement : colors.accentPink}
                  radius={12} offset={3} borderWidth={2}
                  wrapperStyle={styles.followShadow} style={styles.followBtn}
                  onPress={toggleFollow}
                >
                  <ThemedText style={[styles.followText, { color: following ? colors.text : '#000' }]}>
                    {following ? '✓ Following' : '+ Follow club'}
                  </ThemedText>
                </ShadowSurface>
              ) : null}
            </View>

            <ThemedText style={styles.sectionTitle}>EVENTS</ThemedText>
            {events.length === 0 ? (
              <EmptyState title="No events yet" subtitle={`When ${clubName} posts an event, it shows up here.`} />
            ) : (
              events.map((e) => (
                <ShadowSurface
                  key={e.id}
                  backgroundColor={colors.backgroundElement}
                  radius={16} offset={4} borderWidth={2}
                  wrapperStyle={styles.eventShadow} style={styles.eventCard}
                  onPress={() => router.push(`/event-detail?id=${e.id}`)}
                >
                  <View style={styles.eventTopRow}>
                    <ThemedText style={styles.eventTitle} numberOfLines={1}>{e.title}</ThemedText>
                    {categoryLabel(e.category) ? (
                      <View style={[styles.catTag, { backgroundColor: categoryColor(e.category), borderColor: colors.border }]}>
                        <ThemedText style={styles.catTagText}>{categoryLabel(e.category)}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText style={styles.eventMeta} themeColor="textSecondary">
                    {formatWhen(e.event_time)}{e.location ? ` · ${e.location}` : ''} · Tap to RSVP →
                  </ThemedText>
                </ShadowSurface>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130 },
  backBtn: { marginBottom: Spacing.two },
  headerCard: { alignItems: 'center', marginBottom: Spacing.four },
  emojiCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.two },
  emoji: { fontSize: 36 },
  clubName: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  count: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  followShadow: { marginTop: Spacing.three },
  followBtn: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, alignItems: 'center' },
  followText: { fontSize: 14, fontWeight: '900' },
  sectionTitle: { fontWeight: '900', fontSize: 16, letterSpacing: 0.5, marginBottom: Spacing.two },
  eventShadow: { marginBottom: Spacing.two },
  eventCard: { padding: Spacing.three },
  eventTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  eventTitle: { fontSize: 15, fontWeight: '900', flex: 1 },
  eventMeta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  catTag: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  catTagText: { fontSize: 10, fontWeight: '900', color: '#000' },
});
