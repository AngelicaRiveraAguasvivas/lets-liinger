import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { categoryColor, categoryLabel } from '@/lib/categories';
import { CreatorInsights, fetchCreatorInsights } from '../lib/insights';
import { supabase } from '../supabaseClient';

export default function InsightsScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CreatorInsights | null>(null);
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const insights = await fetchCreatorInsights(user.id);
        if (cancelled) return;
        setData(insights);
        setLoading(false);
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const accents = [colors.accentPink, colors.accentCyan, colors.accentYellow, colors.accentGreen];

  // When a club is selected, the event lists below scope to just its events.
  const clubEventIds = selectedClub
    ? new Set(data?.byClub.find((c) => c.name === selectedClub)?.eventIds ?? [])
    : null;
  const shownEvents = clubEventIds
    ? (data?.events ?? []).filter((e) => clubEventIds.has(e.id))
    : (data?.events ?? []);
  const maxRsvps = Math.max(1, ...shownEvents.map((e) => e.rsvps), 0);

  function audienceLine(a: CreatorInsights['audience']): string {
    if (a.total === 0) return 'No one has engaged yet — share your events!';
    const parts: string[] = [];
    if (a.schools[0]) parts.push(`${a.schools[0].pct}% ${a.schools[0].name}`);
    if (a.years[0]) parts.push(`mostly Class of ${a.years[0].year}`);
    if (a.interests[0]) parts.push(`into ${a.interests[0].tag}`);
    return parts.length ? parts.join(' · ') : `${a.total} people engaged`;
  }

  function hookLine(d: CreatorInsights): string {
    if (d.totalEngagement === 0) return 'Share your events to start pulling a crowd.';
    if (d.topEvent && d.topEvent.rsvps > 0) {
      return `“${d.topEvent.title}” is your biggest hit — ${d.topEvent.rsvps} going!`;
    }
    return 'Your buzz is building — keep posting!';
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.backBtn}>
          <ThemedText style={[styles.back, { color: colors.text }]}>‹ back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={[styles.title, { color: colors.text }]}>event insights</ThemedText>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.text} /></View>
        ) : !data || data.totalEvents === 0 ? (
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} wrapperStyle={styles.mb3}>
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyBig}>No events yet</ThemedText>
              <ThemedText style={styles.emptyText} themeColor="textSecondary">
                Post your first event and watch the RSVPs, likes, and comments roll in — your stats show up here.
              </ThemedText>
              <ShadowSurface
                backgroundColor={colors.accentGreen}
                radius={12}
                offset={3}
                wrapperStyle={styles.mt2}
                style={styles.cta}
                onPress={() => router.replace('/')}
              >
                <ThemedText style={styles.ctaText}>+ CREATE AN EVENT</ThemedText>
              </ShadowSurface>
            </View>
          </ShadowSurface>
        ) : (
          <>
            {/* Buzz score hero */}
            <ShadowSurface backgroundColor={colors.accentPink} radius={20} offset={6} wrapperStyle={styles.mb3}>
              <View style={styles.hero}>
                <ThemedText style={styles.heroLabel}>TOTAL BUZZ SCORE</ThemedText>
                <ThemedText style={styles.heroNumber}>{data.totalEngagement}</ThemedText>
                <ThemedText style={styles.heroHook}>{hookLine(data)}</ThemedText>
              </View>
            </ShadowSurface>

            {/* Stat tiles */}
            <View style={styles.tileRow}>
              <StatTile value={data.totalEvents} label="EVENTS" colors={colors} />
              <StatTile value={data.totalRsvps} label="RSVPS" colors={colors} />
            </View>
            <View style={styles.tileRow}>
              <StatTile value={data.totalLikes} label="LIKES" colors={colors} />
              <StatTile value={data.totalComments} label="COMMENTS" colors={colors} />
            </View>

            <ThemedText style={styles.avgLine} themeColor="textSecondary">
              You average {plural(data.avgRsvps, 'RSVP')} per event.
            </ThemedText>

            {/* Your crowd (audience) */}
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>YOUR CROWD</ThemedText>
            <ShadowSurface backgroundColor={colors.accentCyan} radius={16} offset={4} wrapperStyle={styles.mb3} style={styles.crowdCard}>
              <ThemedText style={styles.crowdLine}>{audienceLine(data.audience)}</ThemedText>
              {data.audience.total > 0 && (
                <View style={styles.crowdChips}>
                  {data.audience.interests.slice(0, 4).map((i) => (
                    <View key={i.tag} style={styles.crowdChip}>
                      <ThemedText style={styles.crowdChipText}>{i.tag} · {i.count}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </ShadowSurface>

            {/* By category */}
            {data.byCategory.length > 0 && (
              <>
                <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>BY CATEGORY</ThemedText>
                <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.mb3}>
                  <View style={styles.catCard}>
                    {data.byCategory.map((c) => (
                      <View key={c.key || 'none'} style={styles.catRow}>
                        <View style={[styles.catDot, { backgroundColor: categoryColor(c.key), borderColor: colors.border }]} />
                        <ThemedText style={styles.catName}>{categoryLabel(c.key) ?? 'Uncategorized'}</ThemedText>
                        <ThemedText style={styles.catMeta} themeColor="textSecondary">
                          {plural(c.events, 'event')} · {c.rsvps} RSVPs
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </ShadowSurface>
              </>
            )}

            {/* By club / org — tap to filter the events below */}
            {data.byClub.length > 0 && (
              <>
                <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>BY CLUB / ORG</ThemedText>
                <ThemedText style={styles.hint} themeColor="textSecondary">Tap a club to see just its events below.</ThemedText>
                {data.byClub.map((c) => {
                  const on = selectedClub === c.name;
                  return (
                    <ShadowSurface
                      key={c.name}
                      backgroundColor={on ? colors.accentGreen : colors.backgroundElement}
                      radius={14} offset={3} borderWidth={2}
                      wrapperStyle={styles.mb2} style={styles.clubCard}
                      onPress={() => setSelectedClub(on ? null : c.name)}
                    >
                      <View style={styles.rowTop}>
                        <ThemedText style={[styles.clubName, on && { color: '#000' }]} numberOfLines={1}>{c.name}</ThemedText>
                        <Badge label={`${c.engagement}`} backgroundColor={on ? colors.background : colors.accentGreen} />
                      </View>
                      <ThemedText style={[styles.clubMeta, on && { color: '#000' }]}>
                        {plural(c.events, 'event')} · {c.rsvps} RSVPs · {c.likes} likes · {c.comments} comments
                      </ThemedText>
                    </ShadowSurface>
                  );
                })}
              </>
            )}

            {/* Top event */}
            {data.topEvent && data.topEvent.rsvps > 0 && (
              <>
                <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>TOP EVENT</ThemedText>
                <ShadowSurface
                  backgroundColor={colors.accentYellow}
                  radius={16}
                  offset={4}
                  wrapperStyle={styles.mb3}
                  style={styles.topCard}
                  onPress={() => router.push(`/event-detail?id=${data.topEvent!.id}`)}
                >
                  <ThemedText style={styles.topTitle}>{data.topEvent.title}</ThemedText>
                  <ThemedText style={styles.topMeta}>
                    {data.topEvent.rsvps} RSVPs · {data.topEvent.likes} likes · {data.topEvent.comments} comments
                  </ThemedText>
                </ShadowSurface>
              </>
            )}

            {/* RSVPs per event bar chart (scoped to the selected club) */}
            <View style={styles.sectionHeaderRow}>
              <ThemedText style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                {selectedClub ? `${selectedClub.toUpperCase()} · EVENTS` : 'RSVPS BY EVENT'}
              </ThemedText>
              {selectedClub ? (
                <TouchableOpacity onPress={() => setSelectedClub(null)}>
                  <ThemedText style={[styles.clearFilter, { color: colors.accentPink }]}>✕ clear</ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.mb3}>
              <View style={styles.chartCard}>
                {[...shownEvents]
                  .sort((a, b) => b.rsvps - a.rsvps)
                  .map((e, idx) => (
                    <View key={e.id} style={styles.barRow}>
                      <View style={styles.barHeader}>
                        <ThemedText style={styles.barLabel} numberOfLines={1}>{e.title}</ThemedText>
                        <ThemedText style={styles.barValue}>{e.rsvps}</ThemedText>
                      </View>
                      <View style={[styles.barTrack, { borderColor: colors.border }]}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${(e.rsvps / maxRsvps) * 100}%`, backgroundColor: accents[idx % accents.length] },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
              </View>
            </ShadowSurface>

            {/* Full breakdown */}
            <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>ENGAGEMENT BREAKDOWN</ThemedText>
            {shownEvents.map((e) => (
              <ShadowSurface
                key={e.id}
                backgroundColor={colors.backgroundElement}
                radius={14}
                offset={3}
                borderWidth={2}
                wrapperStyle={styles.mb2}
                style={styles.rowCard}
                onPress={() => router.push(`/event-detail?id=${e.id}`)}
              >
                <View style={styles.rowTop}>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>{e.title}</ThemedText>
                  <Badge label={`${e.engagement}`} backgroundColor={colors.accentGreen} />
                </View>
                <ThemedText style={styles.rowMeta} themeColor="textSecondary">
                  {e.rsvps} going · {plural(e.likes, 'like')} · {plural(e.comments, 'comment')}
                </ThemedText>
              </ShadowSurface>
            ))}

            <ThemedText style={styles.footnote} themeColor="textSecondary">
              Buzz score = RSVPs ×3 + comments ×2 + likes ×1.
            </ThemedText>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ value, label, colors }: { value: number; label: string; colors: any }) {
  return (
    <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} wrapperStyle={styles.tile} style={styles.tileInner}>
      <ThemedText style={styles.tileNumber}>{value}</ThemedText>
      <ThemedText style={styles.tileLabel}>{label}</ThemedText>
    </ShadowSurface>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 130 },
  loadingWrap: { paddingVertical: Spacing.six, alignItems: 'center' },
  backBtn: { marginBottom: Spacing.two },
  back: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 22, letterSpacing: -1 },
  title: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 26, letterSpacing: -1, marginBottom: Spacing.three },
  mb2: { marginBottom: Spacing.two },
  mb3: { marginBottom: Spacing.three },
  mt2: { marginTop: Spacing.two, width: '100%' },
  // empty
  emptyCard: { padding: Spacing.four, alignItems: 'center' },
  emptyBig: { fontSize: 18, fontWeight: '900', marginBottom: Spacing.one },
  emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cta: { paddingVertical: Spacing.two, alignItems: 'center' },
  ctaText: { fontWeight: '900', color: '#000', fontSize: 14 },
  // hero
  hero: { padding: Spacing.four, alignItems: 'center' },
  heroLabel: { fontSize: 12, fontWeight: '900', color: '#000', letterSpacing: 1 },
  heroNumber: { fontSize: 52, fontWeight: '900', color: '#000', lineHeight: 56 },
  heroHook: { fontSize: 13, fontWeight: '800', color: '#000', textAlign: 'center', marginTop: Spacing.one },
  // tiles
  tileRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  tile: { flex: 1 },
  tileInner: { paddingVertical: Spacing.three, alignItems: 'center' },
  tileNumber: { fontSize: 26, fontWeight: '900' },
  tileLabel: { fontSize: 10, fontWeight: '800', opacity: 0.6, letterSpacing: 0.5 },
  avgLine: { fontSize: 13, fontWeight: '700', marginTop: Spacing.one, marginBottom: Spacing.three },
  sectionTitle: { fontWeight: '900', fontSize: 15, letterSpacing: 0.5, marginBottom: Spacing.two },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  clearFilter: { fontSize: 12, fontWeight: '900' },
  hint: { fontSize: 12, fontWeight: '600', marginTop: -Spacing.one, marginBottom: Spacing.two },
  // your crowd
  crowdCard: { padding: Spacing.three },
  crowdLine: { fontSize: 15, fontWeight: '900', color: '#000' },
  crowdChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.two },
  crowdChip: { backgroundColor: '#00000022', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  crowdChipText: { fontSize: 11, fontWeight: '800', color: '#000' },
  // by category
  catCard: { padding: Spacing.three, gap: Spacing.two },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  catDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  catName: { fontSize: 14, fontWeight: '900', flex: 1 },
  catMeta: { fontSize: 12, fontWeight: '700' },
  // by club
  clubCard: { padding: Spacing.three },
  clubName: { fontSize: 15, fontWeight: '900', flex: 1, marginRight: Spacing.two },
  clubMeta: { fontSize: 12, fontWeight: '700', marginTop: 2, opacity: 0.85 },
  // top event
  topCard: { padding: Spacing.three },
  topTitle: { fontSize: 18, fontWeight: '900', color: '#000' },
  topMeta: { fontSize: 13, fontWeight: '800', color: '#000', marginTop: 2 },
  // chart
  chartCard: { padding: Spacing.three, gap: Spacing.three },
  barRow: { gap: 4 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLabel: { fontSize: 13, fontWeight: '800', flex: 1, marginRight: Spacing.two },
  barValue: { fontSize: 13, fontWeight: '900' },
  barTrack: { height: 18, borderWidth: 2, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', minWidth: 3 },
  // breakdown rows
  rowCard: { padding: Spacing.three },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  rowTitle: { fontSize: 15, fontWeight: '900', flex: 1, marginRight: Spacing.two },
  rowMeta: { fontSize: 12, fontWeight: '700' },
  footnote: { fontSize: 11, fontWeight: '600', marginTop: Spacing.two, textAlign: 'center' },
});
