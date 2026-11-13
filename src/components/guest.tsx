import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useAppPrefs, useT } from '@/hooks/app-prefs-context';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_PROFILE, DEMO_THREADS, getDemoEvents } from '@/lib/demo';

// Leaving guest mode sends the person back to the sign-in screen (the root
// layout handles the redirect once isGuest flips off).
export function useLeaveGuest() {
  const { update } = useAppPrefs();
  return () => update({ isGuest: false });
}

export function GuestBanner() {
  const colors = useTheme();
  const { t } = useT();
  const leave = useLeaveGuest();
  return (
    <View
      style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}
      accessibilityRole="summary"
    >
      <ThemedText style={styles.bannerText}>{t('guestBanner')}</ThemedText>
      <TouchableOpacity
        onPress={leave}
        style={[styles.bannerBtn, { backgroundColor: colors.accentYellow, borderColor: colors.border }]}
        accessibilityRole="button"
      >
        <ThemedText style={styles.bannerBtnText}>{t('guestCta')}</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

// Shown when a guest taps something that needs a real account.
export function GuestLockedModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useTheme();
  const { t } = useT();
  const leave = useLeaveGuest();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('close')}>
        <Pressable onPress={() => {}} style={styles.modalInner}>
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} style={styles.modalCard}>
            <ThemedText style={styles.modalTitle} accessibilityRole="header">{t('guestLockedTitle')}</ThemedText>
            <ThemedText style={styles.modalBody} themeColor="textSecondary">{t('guestLockedBody')}</ThemedText>
            <ShadowSurface
              backgroundColor={colors.accentYellow}
              radius={12}
              offset={3}
              wrapperStyle={{ marginTop: Spacing.three }}
              style={styles.modalBtn}
              onPress={() => {
                onClose();
                leave();
              }}
            >
              <ThemedText style={styles.modalBtnText}>{t('guestCta')}</ThemedText>
            </ShadowSurface>
            <TouchableOpacity onPress={onClose} style={styles.modalClose} accessibilityRole="button">
              <ThemedText style={styles.modalCloseText}>{t('close')}</ThemedText>
            </TouchableOpacity>
          </ShadowSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function GuestProfile() {
  const colors = useTheme();
  const router = useRouter();
  const { t } = useT();
  const leave = useLeaveGuest();
  const going = getDemoEvents().filter((e) => ['demo-2', 'demo-5', 'demo-9'].includes(e.id));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.headerRow}>
          <ThemedText style={styles.pageTitle} accessibilityRole="header">@{DEMO_PROFILE.username}</ThemedText>
          <IconButton emoji="⚙️" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </View>
        <GuestBanner />

        <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: colors.accentPink, borderColor: colors.border }]}>
            <ThemedText style={styles.avatarText}>G</ThemedText>
          </View>
          <ThemedText style={styles.name}>{t('guestProfileTitle')}</ThemedText>
          <ThemedText style={styles.bio} themeColor="textSecondary">{t('guestProfileBody')}</ThemedText>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <ThemedText style={styles.statNum}>{DEMO_PROFILE.following}</ThemedText>
              <ThemedText style={styles.statLabel} themeColor="textSecondary">following</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText style={styles.statNum}>{DEMO_PROFILE.followers}</ThemedText>
              <ThemedText style={styles.statLabel} themeColor="textSecondary">followers</ThemedText>
            </View>
            <View style={styles.stat}>
              <ThemedText style={styles.statNum}>{going.length}</ThemedText>
              <ThemedText style={styles.statLabel} themeColor="textSecondary">going</ThemedText>
            </View>
          </View>
          <View style={styles.chips}>
            {DEMO_PROFILE.interests.map((i) => <Chip key={i} label={i} selected selectedColor={colors.accentCyan} />)}
          </View>
        </ShadowSurface>

        <ThemedText style={styles.section}>CLUBS</ThemedText>
        {DEMO_PROFILE.clubs.map((c) => (
          <View key={c.name} style={[styles.row, { borderColor: colors.border }]}>
            <ThemedText style={styles.rowTitle}>{c.name}</ThemedText>
            <ThemedText style={styles.rowSub} themeColor="textSecondary">{c.role}</ThemedText>
          </View>
        ))}

        <ThemedText style={styles.section}>GOING TO</ThemedText>
        {going.map((e) => (
          <TouchableOpacity
            key={e.id}
            style={[styles.row, { borderColor: colors.border }]}
            onPress={() => router.push(`/event-detail?id=${e.id}`)}
            accessibilityRole="link"
          >
            <ThemedText style={styles.rowTitle}>{e.title}</ThemedText>
            <ThemedText style={styles.rowSub} themeColor="textSecondary">{e.location}</ThemedText>
          </TouchableOpacity>
        ))}

        <ShadowSurface
          backgroundColor={colors.accentYellow}
          radius={14}
          offset={3}
          wrapperStyle={{ marginTop: Spacing.four }}
          style={styles.modalBtn}
          onPress={leave}
        >
          <ThemedText style={styles.modalBtnText}>{t('guestCta')}</ThemedText>
        </ShadowSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

export function GuestMessages() {
  const colors = useTheme();
  const { t } = useT();
  const leave = useLeaveGuest();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.page}>
        <ThemedText style={styles.pageTitle} accessibilityRole="header">{t('guestMessagesTitle')}</ThemedText>
        <ThemedText style={styles.bio} themeColor="textSecondary">{t('guestMessagesBody')}</ThemedText>
        {DEMO_THREADS.map((th) => (
          <View key={th.name} style={[styles.thread, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
            <View style={[styles.threadAvatar, { backgroundColor: colors.accentCyan, borderColor: colors.border }]}>
              <ThemedText style={styles.avatarSmallText}>{th.name[0]}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.rowTitle}>{th.name}</ThemedText>
              <ThemedText style={styles.rowSub} themeColor="textSecondary" numberOfLines={1}>{th.last}</ThemedText>
            </View>
            <ThemedText style={styles.rowSub} themeColor="textSecondary">{th.time}</ThemedText>
          </View>
        ))}
        <ShadowSurface
          backgroundColor={colors.accentYellow}
          radius={14}
          offset={3}
          wrapperStyle={{ marginTop: Spacing.four }}
          style={styles.modalBtn}
          onPress={leave}
        >
          <ThemedText style={styles.modalBtnText}>{t('guestCta')}</ThemedText>
        </ShadowSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, padding: Spacing.three,
    marginBottom: Spacing.three, gap: Spacing.two,
  },
  bannerText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  bannerBtn: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  bannerBtnText: { color: '#000', fontWeight: '900', fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  modalInner: { width: '100%', maxWidth: 420 },
  modalCard: { padding: Spacing.four },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: Spacing.two },
  modalBody: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  modalBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  modalBtnText: { color: '#000', fontWeight: '900', fontSize: 14 },
  modalClose: { paddingVertical: Spacing.three, alignItems: 'center' },
  modalCloseText: { fontWeight: '900', fontSize: 14 },
  page: { padding: Spacing.four, paddingBottom: 130, width: '100%', maxWidth: 800, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  pageTitle: { fontFamily: 'Helvetica', fontWeight: '900', fontSize: 28, letterSpacing: -1, lineHeight: 36 },
  profileCard: { padding: Spacing.four, alignItems: 'center' },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 34, fontWeight: '900', color: '#000', lineHeight: 40 },
  name: { fontSize: 22, fontWeight: '900', marginTop: Spacing.two },
  bio: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: Spacing.one, marginBottom: Spacing.three, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: Spacing.five, marginBottom: Spacing.three },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  section: { fontSize: 12, fontWeight: '900', letterSpacing: 1, opacity: 0.6, marginTop: Spacing.four, marginBottom: Spacing.two },
  row: { borderBottomWidth: 1.5, paddingVertical: Spacing.three },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowSub: { fontSize: 12, fontWeight: '600' },
  thread: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 2, borderRadius: 14,
    padding: Spacing.three, marginTop: Spacing.two,
  },
  threadAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: '#000', fontWeight: '900', fontSize: 16 },
});
