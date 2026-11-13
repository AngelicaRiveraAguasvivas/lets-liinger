import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GuestBanner, GuestLockedModal } from '@/components/guest';
import { ReminderButton } from '@/components/reminder-sheet';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useT } from '@/hooks/app-prefs-context';
import { useTheme } from '@/hooks/use-theme';
import { categoryColor, categoryTKey } from '@/lib/categories';
import { getDemoEvent } from '@/lib/demo';
import type { TKey } from '@/lib/i18n';

// Event page for guest-mode sample events. Mirrors the real event page's
// layout; RSVP, like and reminders work locally, and anything that would
// write to the server (comments, sharing) asks the guest to make an account.
export function DemoEventDetail({ id }: { id: string }) {
  const colors = useTheme();
  const router = useRouter();
  const { t, locale } = useT();
  const event = getDemoEvent(id);
  const [going, setGoing] = useState(false);
  const [liked, setLiked] = useState(false);
  const [locked, setLocked] = useState(false);

  if (!event) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemedText style={{ padding: Spacing.four }}>Event not found.</ThemedText>
      </SafeAreaView>
    );
  }

  const when = (() => {
    const [d, tm] = event.event_time.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = tm.split(':').map(Number);
    const dt = new Date(y, m - 1, day, hh, mm);
    return `${dt.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })} · ${dt.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`;
  })();

  const headcount = event.rsvpCount + (going ? 1 : 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <ThemedText style={[styles.back, { color: colors.text }]}>‹ {t('back').toLowerCase()}</ThemedText>
        </TouchableOpacity>

        <GuestBanner />

        <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} style={styles.card}>
          <View style={[styles.badge, { backgroundColor: categoryColor(event.category), borderColor: colors.border }]}>
            <ThemedText style={styles.badgeText}>{t(categoryTKey(event.category) as TKey)}</ThemedText>
          </View>
          <ThemedText style={styles.title} accessibilityRole="header">{event.title}</ThemedText>
          <ThemedText style={styles.meta}>{t('hostedBy')} {event.host}</ThemedText>
          <ThemedText style={styles.description}>{event.description}</ThemedText>
          <ThemedText style={styles.detail}>{event.location}</ThemedText>
          <ThemedText style={styles.detail}>{when}</ThemedText>
          <ThemedText style={styles.detail}>
            {event.capacity != null ? `${headcount}/${event.capacity}` : headcount} {t('going')}
          </ThemedText>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => setGoing((g) => !g)}
              accessibilityRole="button"
              accessibilityState={{ selected: going }}
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: going ? colors.accentGreen : colors.accentYellow }]}
            >
              <ThemedText style={styles.actionText}>{going ? t('rsvpd') : t('rsvp')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLiked((l) => !l)}
              accessibilityRole="button"
              accessibilityLabel={liked ? t('unlike') : t('like')}
              accessibilityState={{ selected: liked }}
              style={[styles.actionBtn, { flex: 0.5, borderColor: colors.border, backgroundColor: liked ? colors.accentPink : colors.accentCyan }]}
            >
              <ThemedText style={styles.actionText}>{liked ? '💖' : '🤍'} {event.likeCount + (liked ? 1 : 0)}</ThemedText>
            </TouchableOpacity>
          </View>

          <ReminderButton event={{ id: event.id, title: event.title, event_time: event.event_time }} />
        </ShadowSurface>

        <ThemedText style={styles.section}>WHO&apos;S GOING ({headcount})</ThemedText>
        <View style={styles.chips}>
          {(going ? ['@guest', ...event.rsvpers] : event.rsvpers).map((u) => (
            <View key={u} style={[styles.chip, { backgroundColor: colors.accentGreen, borderColor: colors.border }]}>
              <ThemedText style={styles.chipText}>{u}</ThemedText>
            </View>
          ))}
        </View>

        <ThemedText style={styles.section}>COMMENTS ({event.comments.length})</ThemedText>
        {event.comments.map((c, i) => (
          <View key={i} style={[styles.comment, { borderColor: colors.border }]}>
            <ThemedText style={styles.commentUser}>{c.user}</ThemedText>
            <ThemedText style={styles.commentText}>{c.text}</ThemedText>
          </View>
        ))}
        <TouchableOpacity
          onPress={() => setLocked(true)}
          style={[styles.commentBox, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}
          accessibilityRole="button"
        >
          <ThemedText themeColor="textSecondary" style={styles.commentText}>{t('guestLockedTitle')}</ThemedText>
        </TouchableOpacity>
      </ScrollView>
      <GuestLockedModal visible={locked} onClose={() => setLocked(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, paddingBottom: 130, width: '100%', maxWidth: 800, alignSelf: 'center' },
  back: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 28, letterSpacing: -1, marginBottom: Spacing.three },
  card: { padding: Spacing.four },
  badge: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2, marginBottom: Spacing.two },
  badgeText: { fontSize: 11, fontWeight: '900', color: '#000' },
  title: { fontSize: 26, fontWeight: '900', lineHeight: 32 },
  meta: { fontSize: 12, fontWeight: '900', marginTop: Spacing.two },
  description: { fontSize: 15, fontWeight: '500', lineHeight: 22, marginTop: Spacing.three },
  detail: { fontSize: 14, fontWeight: '700', marginTop: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  actionBtn: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center' },
  actionText: { color: '#000', fontWeight: '900', fontSize: 14 },
  section: { fontSize: 12, fontWeight: '900', letterSpacing: 1, opacity: 0.6, marginTop: Spacing.four, marginBottom: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  chipText: { color: '#000', fontWeight: '800', fontSize: 12 },
  comment: { borderBottomWidth: 1.5, paddingVertical: Spacing.two },
  commentUser: { fontSize: 13, fontWeight: '900' },
  commentText: { fontSize: 14, fontWeight: '600' },
  commentBox: { borderWidth: 2, borderRadius: 12, padding: Spacing.three, marginTop: Spacing.three },
});
