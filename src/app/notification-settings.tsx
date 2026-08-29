import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_PREFS, NotificationPrefs, getNotificationPrefs, setNotificationPref } from '../lib/settings';
import { supabase } from '../supabaseClient';

type PrefKey = keyof NotificationPrefs;

const ROWS: { key: Exclude<PrefKey, 'paused'>; icon: any; label: string; sub: string }[] = [
  { key: 'messages', icon: 'chatbubble-outline', label: 'Messages', sub: 'When someone sends you a DM' },
  { key: 'follows', icon: 'person-add-outline', label: 'New followers', sub: 'When someone follows you' },
  { key: 'engagement', icon: 'heart-outline', label: 'Event activity', sub: 'RSVPs, likes, and comments on your events' },
  { key: 'new_events', icon: 'calendar-outline', label: 'New events', sub: 'When a new event is posted' },
  { key: 'email', icon: 'mail-outline', label: 'Email notifications', sub: 'Receive occasional emails' },
];

export default function NotificationSettingsScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [selfId, setSelfId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setSelfId(user.id);
      const p = await getNotificationPrefs(user.id);
      if (!cancelled) setPrefs(p);
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(key: PrefKey, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (selfId) setNotificationPref(selfId, key, value);
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: { color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 28, letterSpacing: -1 },
    row: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: Spacing.three, paddingHorizontal: Spacing.three,
      borderBottomWidth: 1.5, borderColor: colors.border,
    },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ThemedText style={dynamicStyles.headerText}>‹ notifications</ThemedText>
        </TouchableOpacity>

        {/* Pause all */}
        <ThemedText style={styles.sectionTitle}>PUSH NOTIFICATIONS</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <View style={[dynamicStyles.row, styles.lastRow]}>
            <View style={styles.left}>
              <Ionicons name="pause-circle-outline" size={22} color={colors.text} />
              <View style={styles.textWrap}>
                <ThemedText style={styles.rowLabel}>Pause all</ThemedText>
                <ThemedText style={styles.rowSub} themeColor="textSecondary">Temporarily turn off every notification</ThemedText>
              </View>
            </View>
            <Switch
              value={prefs.paused}
              onValueChange={(v) => toggle('paused', v)}
              trackColor={{ true: colors.accentPink, false: colors.border }}
              thumbColor="#fff"
            />
          </View>
        </ShadowSurface>

        {/* Per-type */}
        <ThemedText style={styles.sectionTitle}>WHAT YOU GET NOTIFIED ABOUT</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          {ROWS.map((r, i) => (
            <View key={r.key} style={[dynamicStyles.row, i === ROWS.length - 1 && styles.lastRow, prefs.paused && styles.dim]}>
              <View style={styles.left}>
                <Ionicons name={r.icon} size={22} color={colors.text} />
                <View style={styles.textWrap}>
                  <ThemedText style={styles.rowLabel}>{r.label}</ThemedText>
                  <ThemedText style={styles.rowSub} themeColor="textSecondary">{r.sub}</ThemedText>
                </View>
              </View>
              <Switch
                value={!prefs.paused && prefs[r.key]}
                disabled={prefs.paused}
                onValueChange={(v) => toggle(r.key, v)}
                trackColor={{ true: colors.accentGreen, false: colors.border }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </ShadowSurface>

        <ThemedText style={styles.footnote} themeColor="textSecondary">
          These control what shows in your notifications feed and the tab dots. Push-to-phone also respects them once the app is installed on iOS/Android.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130 },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1, opacity: 0.6, marginTop: Spacing.four, marginBottom: Spacing.two },
  cardShadow: { marginBottom: Spacing.one },
  card: { overflow: 'hidden' },
  lastRow: { borderBottomWidth: 0 },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1, marginRight: Spacing.two },
  textWrap: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '800' },
  rowSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  dim: { opacity: 0.4 },
  footnote: { fontSize: 12, fontWeight: '600', marginTop: Spacing.two, lineHeight: 17 },
});
