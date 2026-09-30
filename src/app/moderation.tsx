import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchReports,
  moderatorDeleteEvent,
  reviewReport,
  setShadowBan,
  type ModerationReport,
  type ReportStatus,
} from '../lib/moderation';
import { supabase } from '../supabaseClient';

const TABS: ReportStatus[] = ['open', 'resolved', 'dismissed'];

// Small cross-platform confirm helper (native Alert vs. web confirm()).
function confirmAction(message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert('Please confirm', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function ModerationScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [tab, setTab] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (status: ReportStatus) => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setSelfId(user?.id ?? null);
    const rows = await fetchReports(status);
    setReports(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [load, tab])
  );

  async function act(
    reportId: string,
    status: 'resolved' | 'dismissed',
    resolution?: string
  ) {
    if (!selfId) return;
    setBusyId(reportId);
    await reviewReport(reportId, selfId, status, resolution);
    setBusyId(null);
    setReports((prev) => prev.filter((r) => r.id !== reportId));
  }

  async function liftShadowBan(userId: string, reportId: string) {
    setBusyId(reportId);
    await setShadowBan(userId, false);
    setBusyId(null);
    load(tab);
  }

  function handleDeleteEvent(report: ModerationReport) {
    if (!report.targetEvent) return;
    confirmAction('Delete this event and resolve the report?', async () => {
      setBusyId(report.id);
      const { error } = await moderatorDeleteEvent(report.targetEvent!.id);
      if (error) {
        setBusyId(null);
        return;
      }
      await act(report.id, 'resolved', 'Event removed by moderator');
    });
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: { color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 28, letterSpacing: -1 },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ThemedText style={dynamicStyles.headerText}>‹ reports</ThemedText>
        </TouchableOpacity>

        {/* Status tabs */}
        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[
                styles.tab,
                { borderColor: colors.border },
                tab === t && { backgroundColor: colors.accentYellow },
              ]}
            >
              <ThemedText style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t.toUpperCase()}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        ) : reports.length === 0 ? (
          <ThemedText style={styles.emptyText} themeColor="textSecondary">
            {tab === 'open' ? 'No open reports. All clear.' : `No ${tab} reports.`}
          </ThemedText>
        ) : (
          reports.map((r) => {
            const targetLabel = r.targetEvent
              ? `Event: ${r.targetEvent.title ?? 'Untitled'}`
              : r.targetUser
              ? `User: @${r.targetUser.username ?? r.targetUser.display_name ?? 'unknown'}`
              : 'Unknown target';
            const reporter = r.reporter?.username
              ? `@${r.reporter.username}`
              : r.reporter?.display_name ?? 'Someone';
            const busy = busyId === r.id;

            return (
              <ShadowSurface
                key={r.id}
                backgroundColor={colors.backgroundElement}
                radius={16}
                offset={4}
                borderWidth={2}
                wrapperStyle={styles.cardShadow}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <Badge
                    label={r.targetEvent ? 'EVENT' : 'USER'}
                    backgroundColor={r.targetEvent ? colors.accentCyan : colors.accentPink}
                  />
                  <ThemedText style={styles.time} themeColor="textSecondary">
                    {new Date(r.created_at).toLocaleDateString()}
                  </ThemedText>
                </View>

                <View style={styles.tagLine}>
                  <ThemedText style={styles.target}>{targetLabel}</ThemedText>
                  {r.category ? (
                    <View style={[styles.catTag, { borderColor: colors.border, backgroundColor: colors.accentYellow }]}>
                      <ThemedText style={styles.catTagText}>{r.category}</ThemedText>
                    </View>
                  ) : null}
                  {r.targetUser?.shadow_banned ? (
                    <View style={[styles.catTag, { borderColor: colors.border, backgroundColor: colors.accentPink }]}>
                      <ThemedText style={styles.catTagText}>SHADOW-BANNED</ThemedText>
                    </View>
                  ) : null}
                </View>
                <ThemedText style={styles.reason}>
                  {r.detail ? `"${r.detail}"` : r.reason ? `"${r.reason}"` : 'No details given'}
                </ThemedText>
                <ThemedText style={styles.reporter} themeColor="textSecondary">
                  Reported by {reporter}
                </ThemedText>

                {r.status === 'open' ? (
                  busy ? (
                    <ActivityIndicator color={colors.text} style={styles.busy} />
                  ) : (
                    <View style={styles.actions}>
                      {r.targetUser && (
                        <TouchableOpacity
                          style={[styles.actionChip, { borderColor: colors.border }]}
                          onPress={() => router.push(`/user?id=${r.targetUser!.id}`)}
                        >
                          <ThemedText style={styles.actionChipText}>View user</ThemedText>
                        </TouchableOpacity>
                      )}
                      {r.targetEvent && (
                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: colors.accentPink, borderColor: colors.border }]}
                          onPress={() => handleDeleteEvent(r)}
                        >
                          <ThemedText style={styles.actionChipDark}>Delete event</ThemedText>
                        </TouchableOpacity>
                      )}
                      {r.targetUser?.shadow_banned && (
                        <TouchableOpacity
                          style={[styles.actionChip, { backgroundColor: colors.accentGreen, borderColor: colors.border }]}
                          onPress={() => liftShadowBan(r.targetUser!.id, r.id)}
                        >
                          <ThemedText style={styles.actionChipDark}>Lift shadow-ban</ThemedText>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.actionChip, { backgroundColor: colors.accentGreen, borderColor: colors.border }]}
                        onPress={() => act(r.id, 'resolved', 'Reviewed and actioned')}
                      >
                        <ThemedText style={styles.actionChipDark}>Resolve</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionChip, { borderColor: colors.border }]}
                        onPress={() => act(r.id, 'dismissed', 'No action needed')}
                      >
                        <ThemedText style={styles.actionChipText}>Dismiss</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )
                ) : (
                  r.resolution ? (
                    <ThemedText style={styles.resolution} themeColor="textSecondary">
                      → {r.resolution}
                    </ThemedText>
                  ) : null
                )}
              </ShadowSurface>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: Spacing.four, paddingBottom: 130 },
  tabRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, marginBottom: Spacing.three },
  tab: { flex: 1, paddingVertical: Spacing.two, borderWidth: 2, borderRadius: 10, alignItems: 'center' },
  tabText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  tabTextActive: { color: '#000' },
  loadingWrap: { paddingVertical: Spacing.six, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600', marginTop: Spacing.four, textAlign: 'center' },
  cardShadow: { marginBottom: Spacing.three },
  card: { padding: Spacing.three },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two },
  time: { fontSize: 11, fontWeight: '700' },
  tagLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one, marginBottom: 2 },
  catTag: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  catTagText: { fontSize: 9, fontWeight: '900', color: '#000', textTransform: 'uppercase' },
  target: { fontSize: 15, fontWeight: '900', marginBottom: 2 },
  reason: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.one },
  reporter: { fontSize: 12, fontWeight: '700', marginBottom: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  actionChip: { borderWidth: 2, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  actionChipText: { fontSize: 12, fontWeight: '800' },
  actionChipDark: { fontSize: 12, fontWeight: '900', color: '#000' },
  busy: { marginTop: Spacing.two, alignSelf: 'flex-start' },
  resolution: { fontSize: 12, fontWeight: '700', marginTop: Spacing.one, fontStyle: 'italic' },
});
