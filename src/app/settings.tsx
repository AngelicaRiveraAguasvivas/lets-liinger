import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { useLeaveGuest } from '@/components/guest';
import { HueSlider } from '@/components/hue-slider';
import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { TextScale, useAppPrefs, useT } from '@/hooks/app-prefs-context';
import { useTheme } from '@/hooks/use-theme';
import { PRESET_HUES, hslToHex } from '@/lib/accent';
import { LANGUAGES, type TKey } from '@/lib/i18n';
import { REMINDER_PRESETS } from '@/lib/reminders';
import { deleteAccount } from '../lib/account';
import { isModerator } from '../lib/moderation';
import { disablePush, enablePush, getPushEnabled } from '../lib/push';
import { getBlockedProfiles, getPrivacy, setPrivacy } from '../lib/settings';
import { supabase } from '../supabaseClient';

export default function SettingsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { t } = useT();
  const prefs = useAppPrefs();
  const { isGuest } = prefs;
  const leaveGuest = useLeaveGuest();

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

  const [isPrivate, setIsPrivate] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);

  const [pwModalVisible, setPwModalVisible] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNote, setPwNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isGuest) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !cancelled) {
        setSelfId(user.id);
        setCurrentEmail(user.email ?? '');
        const [mod, push, priv, blk] = await Promise.all([
          isModerator(user.id), getPushEnabled(user.id), getPrivacy(user.id), getBlockedProfiles(user.id),
        ]);
        if (!cancelled) {
          setModerator(mod);
          setPushEnabled(push);
          setIsPrivate(priv);
          setBlockedCount(blk.length);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isGuest]);

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
    setEmailNote('Confirmation links sent. Check both your old and new email to finish.');
  }

  async function handleTogglePrivacy(next: boolean) {
    if (!selfId) return;
    setIsPrivate(next); // optimistic
    await setPrivacy(selfId, next);
  }

  async function handleChangePassword() {
    setPwNote('');
    if (newPw.length < 6) { setPwNote('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setPwNote('Passwords do not match.'); return; }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (error) { setPwNote(error.message); return; }
    setPwNote('Password updated!');
    setNewPw(''); setConfirmPw('');
    setTimeout(() => setPwModalVisible(false), 1200);
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
    // Don't leave this account's saved feed on a shared device.
    await AsyncStorage.removeItem('letsliinger:feed-cache:v1').catch(() => {});
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
    await AsyncStorage.removeItem('letsliinger:feed-cache:v1').catch(() => {});
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
          <ThemedText style={dynamicStyles.headerText} accessibilityRole="header">‹ {t('settings')}</ThemedText>
        </TouchableOpacity>

        {/* Appearance: accent tone */}
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('appearance')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.padCard}>
          <View style={styles.toneHeader}>
            <ThemedText style={styles.rowLabel}>{t('accentTone')}</ThemedText>
            <View style={styles.swatchRow} importantForAccessibility="no-hide-descendants">
              {[colors.accentPink, colors.accentCyan, colors.accentYellow, colors.accentGreen].map((c, i) => (
                <View key={i} style={[styles.swatch, { backgroundColor: c, borderColor: colors.border }]} />
              ))}
            </View>
          </View>
          <ThemedText style={styles.rowSub} themeColor="textSecondary">{t('accentHint')}</ThemedText>
          <HueSlider
            value={prefs.accentHue}
            onChange={(hue) => prefs.update({ accentHue: hue })}
            accessibilityLabel={t('accentTone')}
          />
          <View style={styles.presetRow}>
            {PRESET_HUES.map((p) => {
              const on = prefs.accentHue === p.hue;
              return (
                <TouchableOpacity
                  key={p.hue}
                  onPress={() => prefs.update({ accentHue: p.hue })}
                  accessibilityRole="radio"
                  accessibilityLabel={p.name}
                  accessibilityState={{ checked: on }}
                  style={[styles.presetDot, { backgroundColor: hslToHex(p.hue, 100, 60), borderColor: colors.border }, on && styles.presetOn]}
                />
              );
            })}
          </View>
          <TouchableOpacity
            onPress={() => prefs.update({ accentHue: null })}
            style={[styles.pill, { borderColor: colors.border, backgroundColor: prefs.accentHue == null ? colors.accentPink : 'transparent' }]}
            accessibilityRole="radio"
            accessibilityState={{ checked: prefs.accentHue == null }}
          >
            <ThemedText style={[styles.pillText, prefs.accentHue == null && { color: '#000' }]}>{t('useDefault')}</ThemedText>
          </TouchableOpacity>
        </ShadowSurface>

        {/* Language */}
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('language')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          {LANGUAGES.map((l, i) => {
            const on = prefs.language === l.key;
            return (
              <TouchableOpacity
                key={l.key}
                style={[dynamicStyles.row, i === LANGUAGES.length - 1 && styles.lastRow]}
                onPress={() => prefs.update({ language: l.key })}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <ThemedText style={styles.rowLabel}>{l.label}</ThemedText>
                {on ? <Ionicons name="checkmark-circle" size={22} color={colors.accentGreen} /> : null}
              </TouchableOpacity>
            );
          })}
        </ShadowSurface>
        <ThemedText style={styles.hint} themeColor="textSecondary">{t('languageHint')}</ThemedText>

        {/* Accessibility */}
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('accessibility')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <View style={[dynamicStyles.row, styles.columnRow]}>
            <View style={styles.rowLeft}>
              <Ionicons name="text-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('textSize')}</ThemedText>
            </View>
            <View style={styles.segmentRow} accessibilityRole="radiogroup">
              {([1, 1.15, 1.3] as TextScale[]).map((scale) => {
                const on = prefs.textScale === scale;
                const label = scale === 1 ? t('ts_default') : scale === 1.15 ? t('ts_large') : t('ts_xl');
                return (
                  <TouchableOpacity
                    key={scale}
                    onPress={() => prefs.update({ textScale: scale })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.segmentBtn, { borderColor: colors.border, backgroundColor: on ? colors.accentCyan : 'transparent' }]}
                  >
                    <ThemedText style={[styles.segmentText, { fontSize: 12 * scale }, on && { color: '#000' }]}>{label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={dynamicStyles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="contrast-outline" size={20} color={colors.text} />
              <View style={styles.rowTextWrap}>
                <ThemedText style={styles.rowLabel}>{t('highContrast')}</ThemedText>
                <ThemedText style={styles.rowSub} themeColor="textSecondary">{t('highContrastSub')}</ThemedText>
              </View>
            </View>
            <Switch
              value={prefs.highContrast}
              onValueChange={(v) => prefs.update({ highContrast: v })}
              trackColor={{ true: colors.accentGreen, false: colors.border }}
              thumbColor="#fff"
              accessibilityLabel={t('highContrast')}
            />
          </View>
          <View style={[dynamicStyles.row, styles.lastRow]}>
            <View style={styles.rowLeft}>
              <Ionicons name="pause-circle-outline" size={20} color={colors.text} />
              <View style={styles.rowTextWrap}>
                <ThemedText style={styles.rowLabel}>{t('reduceMotion')}</ThemedText>
                <ThemedText style={styles.rowSub} themeColor="textSecondary">{t('reduceMotionSub')}</ThemedText>
              </View>
            </View>
            <Switch
              value={prefs.reduceMotion}
              onValueChange={(v) => prefs.update({ reduceMotion: v })}
              trackColor={{ true: colors.accentGreen, false: colors.border }}
              thumbColor="#fff"
              accessibilityLabel={t('reduceMotion')}
            />
          </View>
        </ShadowSurface>

        {/* Reminders */}
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('reminders')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.padCard}>
          <ThemedText style={styles.rowLabel}>{t('defaultReminder')}</ThemedText>
          <ThemedText style={styles.rowSub} themeColor="textSecondary">{t('defaultReminderSub')}</ThemedText>
          <View style={styles.presetWrap} accessibilityRole="radiogroup">
            {[null, ...REMINDER_PRESETS].map((min) => {
              const on = prefs.defaultReminder === min;
              const label = min == null ? t('none') : t(`remind_${min}` as TKey);
              return (
                <TouchableOpacity
                  key={String(min)}
                  onPress={() => prefs.update({ defaultReminder: min })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.pill, { borderColor: colors.border, backgroundColor: on ? colors.accentYellow : 'transparent' }]}
                >
                  <ThemedText style={[styles.pillText, on && { color: '#000' }]}>{label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </ShadowSurface>

        {isGuest ? (
          <>
            <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('account')}</ThemedText>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
              <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={leaveGuest} accessibilityRole="button">
                <View style={styles.rowLeft}>
                  <Ionicons name="person-add-outline" size={20} color={colors.text} />
                  <ThemedText style={styles.rowLabel}>{t('guestCta')}</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </ShadowSurface>
          </>
        ) : (
        <>
        {/* Account */}
        <ThemedText style={styles.sectionTitle} accessibilityRole="header">{t('account')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/edit-profile')}>
            <View style={styles.rowLeft}>
              <Ionicons name="person-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('editProfile')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => { setPwNote(''); setNewPw(''); setConfirmPw(''); setPwModalVisible(true); }}>
            <View style={styles.rowLeft}>
              <Ionicons name="key-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('changePassword')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => { setEmailNote(''); setNewEmail(''); setEmailModalVisible(true); }}>
            <View style={styles.rowLeft}>
              <Ionicons name="mail-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('changeEmail')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={dynamicStyles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
              <View style={styles.rowTextWrap}>
                <ThemedText style={styles.rowLabel}>{t('privateAccount')}</ThemedText>
                <ThemedText style={styles.rowSub} themeColor="textSecondary">{t('privateSub')}</ThemedText>
              </View>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={handleTogglePrivacy}
              trackColor={{ true: colors.accentGreen, false: colors.border }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/blocked')}>
            <View style={styles.rowLeft}>
              <Ionicons name="ban-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('blocked')}</ThemedText>
            </View>
            <View style={styles.rowRight}>
              {blockedCount > 0 ? <ThemedText style={styles.rowValue} themeColor="textSecondary">{blockedCount}</ThemedText> : null}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={handleLogOut}>
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('logOut')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </ShadowSurface>

        {/* Notifications */}
        <ThemedText style={styles.sectionTitle}>{t('notifications')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/notification-settings')}>
            <View style={styles.rowLeft}>
              <Ionicons name="options-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('notifSettings')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[dynamicStyles.row, styles.lastRow]}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('pushPhone')}</ThemedText>
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
            : t('pushHint')}
        </ThemedText>

        </>
        )}

        {/* Legal */}
        <ThemedText style={styles.sectionTitle}>{t('legal')}</ThemedText>
        <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
          <TouchableOpacity style={dynamicStyles.row} onPress={() => router.push('/legal?doc=terms')}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-text-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('termsOfService')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={() => router.push('/legal?doc=privacy')}>
            <View style={styles.rowLeft}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
              <ThemedText style={styles.rowLabel}>{t('privacyPolicyRow')}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </ShadowSurface>

        {/* Moderation (moderators only) */}
        {moderator && !isGuest && (
          <>
            <ThemedText style={styles.sectionTitle}>{t('moderation')}</ThemedText>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={16} offset={4} borderWidth={2} wrapperStyle={styles.cardShadow} style={styles.card}>
              <TouchableOpacity style={[dynamicStyles.row, styles.lastRow]} onPress={() => router.push('/moderation')}>
                <View style={styles.rowLeft}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.text} />
                  <ThemedText style={styles.rowLabel}>{t('reviewReports')}</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </ShadowSurface>
          </>
        )}

        {/* Danger zone */}
        {!isGuest && (
        <>
        <ThemedText style={styles.sectionTitle}>{t('dangerZone')}</ThemedText>
        <ShadowSurface
          backgroundColor={colors.accentPink}
          radius={14}
          offset={3}
          wrapperStyle={styles.deleteShadow}
          style={styles.deleteBtn}
          onPress={() => setConfirmVisible(true)}
        >
          <ThemedText style={styles.deleteBtnText}>{t('deleteAccount')}</ThemedText>
        </ShadowSurface>
        <ThemedText style={styles.dangerHint} themeColor="textSecondary">
          {t('deleteHint')}
        </ThemedText>
        </>
        )}
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
                Current: {currentEmail || 'none'}
              </ThemedText>
              <TextField
                label="New email"
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

      {/* Change password */}
      <Modal visible={pwModalVisible} transparent animationType="fade" onRequestClose={() => setPwModalVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => !pwBusy && setPwModalVisible(false)}>
          <Pressable onPress={() => {}}>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} wrapperStyle={styles.confirmShadow} style={styles.confirmCard}>
              <ThemedText style={styles.confirmTitle}>Change password</ThemedText>
              <TextField label="New password" secureTextEntry value={newPw} onChangeText={setNewPw} />
              <TextField label="Confirm new password" secureTextEntry value={confirmPw} onChangeText={setConfirmPw} />
              {pwNote ? <ThemedText style={styles.hint} themeColor="accentCyan">{pwNote}</ThemedText> : null}
              <ShadowSurface
                backgroundColor={colors.accentYellow}
                radius={12} offset={3}
                wrapperStyle={styles.confirmDeleteShadow} style={styles.confirmDeleteBtn}
                onPress={pwBusy ? undefined : handleChangePassword}
                disabled={pwBusy}
              >
                {pwBusy ? <ActivityIndicator color="#000" /> : <ThemedText style={styles.deleteBtnText}>Update password</ThemedText>}
              </ShadowSurface>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => !pwBusy && setPwModalVisible(false)} disabled={pwBusy}>
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
  scrollContent: { padding: Spacing.four, paddingBottom: 130, width: '100%', maxWidth: 720, alignSelf: 'center' },
  padCard: { padding: Spacing.three },
  toneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.one },
  swatchRow: { flexDirection: 'row', gap: 4 },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  presetRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one, marginBottom: Spacing.three, flexWrap: 'wrap' },
  presetDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2 },
  presetOn: { borderWidth: 4 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  pill: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 7 },
  pillText: { fontSize: 12, fontWeight: '800' },
  columnRow: { flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.two },
  segmentRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  segmentBtn: { borderWidth: 2, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: 7 },
  segmentText: { fontWeight: '800' },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1, opacity: 0.6, marginTop: Spacing.four, marginBottom: Spacing.two },
  cardShadow: { marginBottom: Spacing.one },
  card: { overflow: 'hidden' },
  lastRow: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1, marginRight: Spacing.two },
  rowTextWrap: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  rowValue: { fontSize: 14, fontWeight: '800' },
  rowSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
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
