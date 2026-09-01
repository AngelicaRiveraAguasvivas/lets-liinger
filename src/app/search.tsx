import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PersonRow } from '@/components/person-row';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryColor, categoryLabel } from '@/lib/categories';
import { followUser, getFollowingIds, getSuggestions, PublicProfile, searchProfiles, unfollowUser } from '../lib/follows';
import { getBlockedIds } from '../lib/moderation';
import { supabase } from '../supabaseClient';

type Tab = 'people' | 'events' | 'clubs';
const TABS: { key: Tab; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'events', label: 'Events' },
  { key: 'clubs', label: 'Clubs' },
];

interface EventHit {
  id: string;
  title: string;
  location: string | null;
  category: string | null;
  school: string | null;
  visibility: string | null;
  created_by: string | null;
}
interface ClubHit { id: string; name: string; emoji: string | null; }

export default function SearchScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [selfId, setSelfId] = useState<string | null>(null);
  const [myUniversity, setMyUniversity] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('people');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [eventResults, setEventResults] = useState<EventHit[]>([]);
  const [clubResults, setClubResults] = useState<ClubHit[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);
  const timer = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        setSelfId(user.id);
        const [prof, following, blocked] = await Promise.all([
          supabase.from('profiles').select('interests, university').eq('id', user.id).single(),
          getFollowingIds(user.id),
          getBlockedIds(user.id),
        ]);
        if (cancelled) return;
        setMyUniversity((prof.data as any)?.university ?? null);
        setFollowingIds(following);
        setBlockedIds(blocked);
        const exclude = new Set<string>([...following, ...blocked]);
        const sugg = await getSuggestions(user.id, (prof.data as any)?.interests ?? [], exclude);
        if (!cancelled) setSuggestions(sugg);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const runSearch = useCallback(async (text: string, which: Tab) => {
    const q = text.trim();
    if (!q) {
      setResults([]); setEventResults([]); setClubResults([]); setSearching(false);
      return;
    }
    setSearching(true);
    if (which === 'people') {
      const found = await searchProfiles(q, selfId);
      setResults(found.filter((p) => !blockedIds.has(p.id)));
    } else if (which === 'events') {
      const { data } = await supabase
        .from('events')
        .select('id, title, location, category, school, visibility, created_by')
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(25);
      const hits = (data as EventHit[]) ?? [];
      // Hide "my school only" events from every other school (except the
      // creator, who can always see their own) — the same visibility rule
      // the home feed and map apply.
      setEventResults(hits.filter((e) => e.visibility !== 'school' || e.school === myUniversity || e.created_by === selfId));
    } else {
      const { data } = await supabase
        .from('clubs')
        .select('id, name, emoji')
        .ilike('name', `%${q}%`)
        .limit(25);
      setClubResults((data as ClubHit[]) ?? []);
    }
    setSearching(false);
  }, [selfId, blockedIds, myUniversity]);

  function onChange(text: string) {
    setQuery(text);
    setTouched(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(text, tab), 350);
  }

  function switchTab(next: Tab) {
    setTab(next);
    if (query.trim()) runSearch(query, next);
  }

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

  const hasQuery = !!query.trim();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn}>
          <ThemedText style={[styles.back, { color: colors.text }]}>‹ back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={[styles.title, { color: colors.text }]}>search</ThemedText>

        <TextField
          placeholder="Search people, events, clubs…"
          value={query}
          onChangeText={onChange}
          autoCapitalize="none"
          autoFocus
        />

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => switchTab(t.key)}
              style={[styles.tab, { borderColor: colors.border }, tab === t.key && { backgroundColor: colors.accentPink }]}
            >
              <ThemedText style={[styles.tabText, tab === t.key && { color: '#000' }]}>{t.label}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.results}>
          {searching ? (
            <ActivityIndicator size="large" color={colors.text} style={{ marginTop: Spacing.four }} />
          ) : tab === 'people' ? (
            results.length > 0 ? (
              results.map((p) => (
                <PersonRow key={p.id} profile={p} isFollowing={followingIds.has(p.id)} onToggleFollow={() => toggleFollow(p.id)} />
              ))
            ) : hasQuery && touched ? (
              <ThemedText style={styles.note} themeColor="textSecondary">No one found for “{query.trim()}”.</ThemedText>
            ) : suggestions.length > 0 ? (
              <>
                <ThemedText style={styles.suggestTitle}>PEOPLE YOU MAY KNOW</ThemedText>
                <ThemedText style={styles.suggestSub} themeColor="textSecondary">Based on interests you share.</ThemedText>
                {suggestions.map((p) => (
                  <PersonRow key={p.id} profile={p} isFollowing={followingIds.has(p.id)} onToggleFollow={() => toggleFollow(p.id)} />
                ))}
              </>
            ) : (
              <ThemedText style={styles.note} themeColor="textSecondary">Search classmates by name or @username.</ThemedText>
            )
          ) : tab === 'events' ? (
            eventResults.length > 0 ? (
              eventResults.map((e) => (
                <ShadowSurface
                  key={e.id}
                  backgroundColor={colors.backgroundElement}
                  radius={14} offset={3} borderWidth={2}
                  wrapperStyle={styles.rowWrap} style={styles.row}
                  onPress={() => router.push(`/event-detail?id=${e.id}`)}
                >
                  <View style={styles.rowInfo}>
                    <ThemedText style={styles.rowTitle} numberOfLines={1}>{e.title}</ThemedText>
                    {e.location ? <ThemedText style={styles.rowSub} themeColor="textSecondary" numberOfLines={1}>{e.location}</ThemedText> : null}
                  </View>
                  {categoryLabel(e.category) ? (
                    <View style={[styles.catTag, { backgroundColor: categoryColor(e.category), borderColor: colors.border }]}>
                      <ThemedText style={styles.catTagText}>{categoryLabel(e.category)}</ThemedText>
                    </View>
                  ) : null}
                </ShadowSurface>
              ))
            ) : (
              <ThemedText style={styles.note} themeColor="textSecondary">{hasQuery ? 'No events found.' : 'Search events by title.'}</ThemedText>
            )
          ) : (
            clubResults.length > 0 ? (
              clubResults.map((c) => (
                <ShadowSurface
                  key={c.id}
                  backgroundColor={colors.backgroundElement}
                  radius={14} offset={3} borderWidth={2}
                  wrapperStyle={styles.rowWrap} style={styles.row}
                  onPress={() => router.push(`/club?name=${encodeURIComponent(c.name)}`)}
                >
                  <ThemedText style={styles.rowTitle}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</ThemedText>
                </ShadowSurface>
              ))
            ) : (
              <ThemedText style={styles.note} themeColor="textSecondary">{hasQuery ? 'No clubs found.' : 'Search clubs and orgs by name.'}</ThemedText>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 130 },
  backBtn: { marginBottom: Spacing.two },
  back: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  title: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 26, letterSpacing: -1, marginBottom: Spacing.two },
  tabRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  tab: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '900' },
  results: { marginTop: Spacing.three },
  note: { fontSize: 13, fontWeight: '600', marginTop: Spacing.three, textAlign: 'center' },
  suggestTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  suggestSub: { fontSize: 12, fontWeight: '600', marginBottom: Spacing.three },
  rowWrap: { marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, gap: Spacing.two },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '900' },
  rowSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  catTag: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  catTagText: { fontSize: 10, fontWeight: '900', color: '#000' },
});
