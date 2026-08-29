import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount } from '../lib/account';
import { isModerator } from '../lib/moderation';
import { disablePush, enablePush, getPushEnabled } from '../lib/push';
import { supabase } from '../supabaseClient';

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();

  const [selfId, setSelfId] = useState<string | null>(null);
  const [moderator, setModerator] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState('');

  const [currentEmail, setCurrentEmail] = useState('');
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNote, setEmailNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !cancelled) {
        setSelfId(user.id);
        setCurrentEmail(user.email ?? '');
        const [mod, push] = await Promise.all([isModerator(user.id), getPushEnabled(user.id)]);
        if (!cancelled) {
          setModerator(mod);
          setPushEnabled(push);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleChangeEmail() {
    setEmailNote('');
    const next = newEmail.trim().toLowerCase();
    if (!next || !next.includes('@')) {
      setEmailNote('Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: next });
    setEmailBusy(false);
    if (error) {
      setEmailNote(error.message);
      return;
    }
    setEmailNote('Confirmation links sent — check both your old and new email to finish.');
  }

  async function handleTogglePush(next: boolean) {
    if (!selfId || pushBusy) return;
    setPushNote('');
    setPushBusy(true);
    const { error } = next ? await enablePush(selfId) : await disablePush(selfId);
    setPushBusy(false);
    if (error) {
      setPushEnabled(false);
      setPushNote(error);
      return;
    }
    setPushEnabled(next);
  }

  async function handleLogOut() {
    await supabase.auth.signOut();
    // Root layout listens for the auth-state change and redirects to /auth.
  }

  async function handleDelete() {
    setErrorMsg('');
    setDeleting(true);
    const { error } = await deleteAccount();
    setDeleting(false);
    if (error) {
      setErrorMsg(error);
      return;
    }
    setConfirmVisible(false);
    // Account + session are gone; root layout redirects to /auth.
  }

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    headerText: { color: colors.text, fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 28, letterSpacing: -1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Spacing.three,
      paddingHorizontal: Spacing.three,
      borderBottomWidth: 1.5,
      borderColor: colors.border,
    },
  }), [colors]);

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
          <ThemedText style={dynamicStyles.headerText}>‹ settings</ThemedText>
        </TouchableOpacity>

        {/* Account */}
        <ThemedText style={styles.sectionTitle}>ACCOUNT</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/edit-profile')}>
            <View style={styles.rowLeft}>
              <Ionicons name="person-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Edit profile</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => { setEmailNote(''); setNewEmail(''); setEmailModalVisible(true); }}>
            <View style={styles.rowLeft}>
              <Ionicons name="mail-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Change email</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={handleLogOut}>
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Log out</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </ShadowSurface>

        {/* Notifications */}
        <ThemedText style={styles.sectionTitle}>NOTIFICATIONS</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <View style={[dynamicStyles.row, styles.lastRow]}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Push to my phone</ThemedText>
            </View>
            {pushBusy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Switch
                value={pushEnabled}
                onValueChange={handleTogglePush}
                trackColor={{ true: colors.accentGreen, false: colors.border }}
                thumbColor="#fff"
              />
            )}
          </View>
        </ShadowSurface>
        <ThemedText style={styles.hint} themeColor="textSecondary">
          {pushNote
            ? pushNote
            : 'Get a notification when someone messages you or a new event is posted. Works in the installed iOS/Android app.'}
        </ThemedText>

        {/* Legal */}
        <ThemedText style={styles.sectionTitle}>LEGAL</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/legal?doc=terms')}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Terms of Service</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={() => router.push('/legal?doc=privacy')}>
            <View style={styles.rowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>Privacy Policy</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </ShadowSurface>

        {/* Moderation (moderators only) */}
        {moderator && (
          <>
            <ThemedText style={styles.sectionTitle}>MODERATION</ThemedText>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
              <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={() => router.push('/moderation')}>
                <View style={styles.rowLeft}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
                  <ThemedText style={styles.rowLabel}>Review reports</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </ShadowSurface>
          </>
        )}

        {/* Danger zone */}
        <ThemedText style={styles.sectionTitle}>DANGER ZONE</ThemedText>
        <ShadowSurface
          backgroundColor={colors.accentPink}
          radius={14}
          offset={3}
          wrapperStyle={styles.deleteShadow}
          style={styles.deleteBtn}
          onPress={() => setConfirmVisible(true)}
        >
          <ThemedText style={styles.deleteBtnText}>DELETE MY ACCOUNT</ThemedText>
        </ShadowSurface>
        <ThemedText style={styles.dangerHint} themeColor="textSecondary">
          Permanently deletes your profile, events, messages, and activity. This can&apos;t be undone.
        </ThemedText>
      </ScrollView>

      {/* Delete confirmation */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => !deleting && setConfirmVisible(false)}>
          <Pressable onPress={() => {}}>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} wrapperStyle={styles.confirmShadow} style={styles.confirmCard}>
              <ThemedText style={styles.confirmTitle}>Delete your account?</ThemedText>
              <ThemedText style={styles.confirmBody} themeColor="textSecondary">
                This permanently removes your profile, your events, your messages, and everything else tied to your account. There&apos;s no way to get it back.
              </ThemedText>

              {errorMsg ? <ThemedText style={styles.error}>{errorMsg}</ThemedText> : null}

              <ShadowSurface
                backgroundColor={colors.accentPink}
                radius={12}
                offset={3}
                wrapperStyle={styles.confirmDeleteShadow}
                style={styles.confirmDeleteBtn}
                onPress={deleting ? undefined : handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <ThemedText style={styles.deleteBtnText}>Yes, delete everything</ThemedText>
                )}
              </ShadowSurface>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => !deleting && setConfirmVisible(false)} disabled={deleting}>
                <ThemedText style={styles.cancelText}>Cancel</ThemedText>
              </TouchableOpacity>
            </ShadowSurface>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change email */}
      <Modal visible={emailModalVisible} transparent animationType="fade" onRequestClose={() => setEmailModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => !emailBusy && setEmailModalVisible(false)}>
          <Pressable onPress={() => {}}>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} wrapperStyle={styles.confirmShadow} style={styles.confirmCard}>
              <ThemedText style={styles.confirmTitle}>Change email</ThemedText>
              <ThemedText style={styles.confirmBody} themeColor="textSecondary">
                Current: {currentEmail || '—'}
              </ThemedText>
              <TextField
                label="New email"
                placeholder="you@newemail.com"
                autoCapitalize="none"
                keyboardType="email-address"
                value={newEmail}
                onChangeText={setNewEmail}
              />
              {emailNote ? <ThemedText style={styles.hint} themeColor="accentCyan">{emailNote}</ThemedText> : null}
              <ShadowSurface
                backgroundColor={colors.accentYellow}
                radius={12} offset={3}
                wrapperStyle={styles.confirmDeleteShadow} style={styles.confirmDeleteBtn}
                onPress={emailBusy ? undefined : handleChangeEmail}
                disabled={emailBusy}
              >
                {emailBusy ? <ActivityIndicator color="#000" /> : <ThemedText style={styles.deleteBtnText}>Send confirmation</ThemedText>}
              </ShadowSurface>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => !emailBusy && setEmailModalVisible(false)} disabled={emailBusy}>
                <ThemedText style={styles.cancelText}>Close</ThemedText>
              </TouchableOpacity>
            </ShadowSurface>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: Spacing.four, paddingBottom: 130 },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1, opacity: 0.6, marginTop: Spacing.four, marginBottom: Spacing.two },
  cardShadow: { marginBottom: Spacing.one },
  card: { overflow: 'hidden' },
  lastRow: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowLabel: { fontSize: 15, fontWeight: '800' },
  chevron: { fontSize: 20, fontWeight: '900' },
  deleteShadow: { marginTop: Spacing.two },
  deleteBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  deleteBtnText: { fontWeight: '900', color: '#000', fontSize: 14, letterSpacing: 0.5 },
  dangerHint: { fontSize: 12, fontWeight: '600', marginTop: Spacing.two, lineHeight: 17 },
  hint: { fontSize: 12, fontWeight: '600', marginTop: Spacing.one, lineHeight: 17 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.four },
  confirmShadow: {},
  confirmCard: { padding: Spacing.four },
  confirmTitle: { fontSize: 20, fontWeight: '900', marginBottom: Spacing.two },
  confirmBody: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: Spacing.three },
  confirmDeleteShadow: { marginTop: Spacing.two },
  confirmDeleteBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  cancelBtn: { paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
  cancelText: { fontSize: 14, fontWeight: '900' },
  error: { color: '#ff6b6b', fontWeight: '700', marginBottom: Spacing.two, textAlign: 'center' },
});
