import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarBubble } from '@/components/avatar-bubble';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { unblockUser } from '../lib/moderation';
import { BlockedProfile, getBlockedProfiles } from '../lib/settings';
import { supabase } from '../supabaseClient';

export default function BlockedScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { setLoading(false); return; }
        setSelfId(user.id);
        const list = await getBlockedProfiles(user.id);
        if (!cancelled) { setBlocked(list); setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  async function handleUnblock(id: string) {
    if (!selfId) return;
    setBlocked((prev) => prev.filter((b) => b.id !== id));
    await unblockUser(selfId, id);
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: { color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 28, letterSpacing: -1 },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ThemedText style={dynamicStyles.headerText}>‹ blocked</ThemedText>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color={colors.text} style={{ marginTop: Spacing.six }} />
        ) : blocked.length === 0 ? (
          <EmptyState title="No blocked accounts" subtitle="People you block will show up here. They can't message you or see you." />
        ) : (
          blocked.map((b) => {
            const name = b.display_name || b.username || 'Someone';
            return (
              <ShadowSurface
                key={b.id}
                backgroundColor={colors.backgroundElement}
                radius={14} offset={3} borderWidth={2}
                wrapperStyle={styles.rowWrap} style={styles.row}
              >
                <AvatarBubble url={b.avatar_url} name={name} size={40} userId={b.id} />
                <View style={styles.info}>
                  <ThemedText style={styles.name} numberOfLines={1}>@{b.username || 'user'}</ThemedText>
                  <ThemedText style={styles.sub} themeColor="textSecondary" numberOfLines={1}>{b.display_name || ''}</ThemedText>
                </View>
                <ShadowSurface
                  backgroundColor={colors.accentPink}
                  radius={10} offset={2} borderWidth={2}
                  onPress={() => handleUnblock(b.id)} style={styles.unblockBtn}
                >
                  <ThemedText style={styles.unblockText}>Unblock</ThemedText>
                </ShadowSurface>
              </ShadowSurface>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130 },
  rowWrap: { marginBottom: Spacing.two, marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '900' },
  sub: { fontSize: 12, fontWeight: '600' },
  unblockBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  unblockText: { fontSize: 12, fontWeight: '900', color: '#000' },
});
