import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useAppPrefs, useT } from '@/hooks/app-prefs-context';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES } from '@/lib/i18n';
import { PRIVACY_TEXT, TERMS_TEXT } from '../lib/legal';
import { resolveSchoolFromEmail } from '../lib/school-auth';
import { supabase } from '../supabaseClient';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const colors = useTheme();
  const { t } = useT();
  const { language, update, reduceMotion } = useAppPrefs();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Age gate + Terms acceptance are required to create an account (store rule).
  const [is13, setIs13] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<null | 'terms' | 'privacy'>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setErrorMsg('');
    setInfoMsg('');
  }

  async function handleSignUp() {
    setErrorMsg('');
    setInfoMsg('');
    if (!email.trim() || !password) {
      setErrorMsg(t('errEmailPassword'));
      return;
    }
    if (!is13) {
      setErrorMsg(t('errAge'));
      return;
    }
    if (!agreedTerms) {
      setErrorMsg(t('errTerms'));
      return;
    }

    setLoading(true);

    // Students-only gate: only school emails may create an account, and the
    // school is derived from the (verified) email domain, not self-reported.
    const resolution = await resolveSchoolFromEmail(email);
    if (resolution.status === 'rejected') {
      setErrorMsg(resolution.message);
      setLoading(false);
      return;
    }
    const school = resolution.status === 'known' ? resolution.school : null;

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          age_confirmed: true,
          terms_accepted_at: new Date().toISOString(),
          school,
          school_locked: resolution.status === 'known',
        },
      },
    });
    if (error) {
      setErrorMsg(error.message);
    } else if (!data.session) {
      // Email confirmation is switched on in Supabase, so no session yet
      setInfoMsg(t('infoConfirm'));
    }
    // On success with a session, the root layout takes over and routes to onboarding
    setLoading(false);
  }

  async function handleSignIn() {
    setErrorMsg('');
    setInfoMsg('');
    if (!email.trim() || !password) {
      setErrorMsg(t('errEmailPassword'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErrorMsg(error.message);
    // On success, the root layout takes over and routes onward
    setLoading(false);
  }

  async function handleForgotPassword() {
    setErrorMsg('');
    setInfoMsg('');
    if (!email.trim()) {
      setErrorMsg(t('errEnterEmail'));
      return;
    }
    const redirectTo =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/reset-password`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) setErrorMsg(error.message);
    else setInfoMsg(t('infoReset'));
  }

  // The root layout sees isGuest and opens the app with sample data.
  function browseAsGuest() {
    update({ isGuest: true });
  }

  const legalText = legalDoc === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT;
  const inputStyle = [styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.border }];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.column}>
            {/* Brand */}
            <View style={styles.brand}>
              <ThemedText style={[styles.title, { color: colors.text }]} accessibilityRole="header">
                LetsLiinger
              </ThemedText>
              <View style={[styles.sticker, { backgroundColor: colors.accentPink, borderColor: colors.border }]}>
                <ThemedText style={styles.stickerText}>{t('authTagline')}</ThemedText>
              </View>
            </View>

            <ShadowSurface backgroundColor={colors.backgroundElement} radius={22} offset={6} style={styles.card}>
              {/* Sign in / Create account switch */}
              <View style={[styles.segment, { borderColor: colors.border }]} accessibilityRole="tablist">
                {(['signin', 'signup'] as Mode[]).map((m) => {
                  const on = mode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => switchMode(m)}
                      style={[styles.segmentBtn, on && { backgroundColor: m === 'signin' ? colors.accentYellow : colors.accentCyan }]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <ThemedText style={[styles.segmentText, on && { color: '#000' }]}>
                        {m === 'signin' ? t('signIn') : t('createAccount')}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ThemedText style={styles.label} themeColor="accentCyan" nativeID="email-label">
                {mode === 'signup' ? t('schoolEmail') : t('email')}
              </ThemedText>
              <TextInput
                style={inputStyle}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                accessibilityLabel={mode === 'signup' ? t('schoolEmail') : t('email')}
                accessibilityLabelledBy="email-label"
              />

              <ThemedText style={styles.label} themeColor="accentCyan">{t('password')}</ThemedText>
              <View style={[styles.pwRow, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.pwInput, { color: colors.text }]}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={mode === 'signin' ? handleSignIn : undefined}
                  accessibilityLabel={t('password')}
                />
                <TouchableOpacity
                  onPress={() => setShowPw((v) => !v)}
                  style={styles.pwToggle}
                  accessibilityRole="button"
                  accessibilityLabel={showPw ? t('hidePassword') : t('showPassword')}
                  hitSlop={8}
                >
                  <ThemedText style={styles.pwToggleText} themeColor="textSecondary">
                    {showPw ? t('hidePassword') : t('showPassword')}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              {mode === 'signin' ? (
                <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow} accessibilityRole="button">
                  <ThemedText style={[styles.forgot, { color: colors.accentCyan }]}>{t('forgotPassword')}</ThemedText>
                </TouchableOpacity>
              ) : (
                <View style={styles.checksWrap}>
                  <ThemedText style={styles.schoolNote} themeColor="textSecondary">{t('signUpNote')}</ThemedText>
                  <Checkbox
                    checked={is13}
                    onToggle={() => setIs13((v) => !v)}
                    borderColor={colors.border}
                    checkColor={colors.accentGreen}
                    label={t('age13')}
                  >
                    <ThemedText style={styles.checkLabel}>{t('age13')}</ThemedText>
                  </Checkbox>
                  <Checkbox
                    checked={agreedTerms}
                    onToggle={() => setAgreedTerms((v) => !v)}
                    borderColor={colors.border}
                    checkColor={colors.accentGreen}
                    label={`${t('agreePrefix')} ${t('terms')} ${t('and')} ${t('privacy')}`}
                  >
                    <ThemedText style={styles.checkLabel}>
                      {t('agreePrefix')}{' '}
                      <ThemedText style={[styles.link, { color: colors.accentCyan }]} onPress={() => setLegalDoc('terms')} accessibilityRole="link">
                        {t('terms')}
                      </ThemedText>{' '}
                      {t('and')}{' '}
                      <ThemedText style={[styles.link, { color: colors.accentCyan }]} onPress={() => setLegalDoc('privacy')} accessibilityRole="link">
                        {t('privacy')}
                      </ThemedText>
                    </ThemedText>
                  </Checkbox>
                </View>
              )}

              {errorMsg ? (
                <ThemedText style={styles.error} accessibilityLiveRegion="assertive" accessibilityRole="alert">{errorMsg}</ThemedText>
              ) : null}
              {infoMsg ? (
                <ThemedText style={styles.info} themeColor="accentCyan" accessibilityLiveRegion="polite">{infoMsg}</ThemedText>
              ) : null}

              <ShadowSurface
                backgroundColor={mode === 'signin' ? colors.accentYellow : colors.accentCyan}
                radius={14}
                offset={3}
                wrapperStyle={styles.primaryShadow}
                style={styles.btn}
                onPress={mode === 'signin' ? handleSignIn : handleSignUp}
                disabled={loading}
              >
                <ThemedText style={styles.buttonText}>
                  {loading ? '...' : mode === 'signin' ? t('signIn') : t('createAccount')}
                </ThemedText>
              </ShadowSurface>
            </ShadowSurface>

            {/* Guest mode */}
            <View style={styles.dividerRow} importantForAccessibility="no-hide-descendants">
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <ThemedText style={styles.dividerText} themeColor="textSecondary">{t('orDivider')}</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              onPress={browseAsGuest}
              style={[styles.guestBtn, { borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityHint={t('guestNote')}
            >
              <ThemedText style={styles.guestBtnText}>👀 {t('browseGuest')}</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.guestNote} themeColor="textSecondary">{t('guestNote')}</ThemedText>

            {/* Language */}
            <View style={styles.langRow} accessibilityRole="radiogroup">
              {LANGUAGES.map((l) => {
                const on = language === l.key;
                return (
                  <TouchableOpacity
                    key={l.key}
                    onPress={() => update({ language: l.key })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={[styles.langChip, { borderColor: on ? colors.border : 'transparent' }]}
                  >
                    <ThemedText style={[styles.langText, !on && { opacity: 0.6 }]}>{l.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Legal text modal (works pre-auth, where in-app routes aren't reachable) */}
      <Modal visible={legalDoc !== null} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setLegalDoc(null)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setLegalDoc(null)} accessibilityRole="button" accessibilityLabel={t('back')}>
              <ThemedText style={[styles.modalClose, { color: colors.text }]}>‹ {t('back').toLowerCase()}</ThemedText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.legalBody}>{legalText}</ThemedText>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Checkbox({
  checked,
  onToggle,
  borderColor,
  checkColor,
  label,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  borderColor: string;
  checkColor: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={styles.checkRow}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.checkbox, { borderColor }, checked && { backgroundColor: checkColor }]}>
        {checked ? <ThemedText style={styles.checkMark}>✓</ThemedText> : null}
      </View>
      <View style={styles.checkTextWrap}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: Spacing.five },
  title: {
    fontFamily: 'Helvetica', fontWeight: '900',
    fontSize: 44, letterSpacing: -1.5, textAlign: 'center',
    // lineHeight + padding keep the heavy title from being clipped (mainly
    // an Android glyph-clipping issue with 900-weight text).
    lineHeight: 54, paddingVertical: 2,
  },
  sticker: {
    marginTop: Spacing.two, borderWidth: 2, borderRadius: 999,
    paddingHorizontal: Spacing.three, paddingVertical: 4, transform: [{ rotate: '-3deg' }],
  },
  stickerText: { color: '#000', fontWeight: '900', fontSize: 13 },
  card: { padding: Spacing.four },
  segment: { flexDirection: 'row', borderWidth: 2, borderRadius: 14, padding: 3, gap: 3, marginBottom: Spacing.two },
  segmentBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  segmentText: { fontWeight: '900', fontSize: 13 },
  label: { fontSize: 12, fontWeight: '900', marginTop: Spacing.three, marginBottom: Spacing.two, letterSpacing: 0.5 },
  input: { padding: Spacing.three, borderRadius: 12, borderWidth: 2, fontSize: 15 },
  pwRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 2 },
  pwInput: { flex: 1, padding: Spacing.three, fontSize: 15 },
  pwToggle: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  pwToggleText: { fontSize: 12, fontWeight: '900' },
  forgotRow: { alignSelf: 'flex-end', marginTop: Spacing.two, paddingVertical: Spacing.one },
  forgot: { fontSize: 13, fontWeight: '800' },
  checksWrap: { marginTop: Spacing.three, gap: Spacing.two },
  schoolNote: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.two, marginTop: 1,
  },
  checkMark: { fontSize: 14, fontWeight: '900', color: '#000' },
  checkTextWrap: { flex: 1 },
  checkLabel: { fontSize: 13, fontWeight: '700', lineHeight: 20 },
  link: { fontWeight: '900', textDecorationLine: 'underline' },
  btn: { paddingVertical: Spacing.three, alignItems: 'center' },
  primaryShadow: { marginTop: Spacing.four },
  buttonText: { fontWeight: '900', color: '#000', fontSize: 15 },
  error: { color: '#ff6b6b', fontWeight: '700', marginTop: Spacing.three, textAlign: 'center' },
  info: { fontWeight: '700', marginTop: Spacing.three, textAlign: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.five, marginBottom: Spacing.three },
  dividerLine: { flex: 1, height: 1.5, opacity: 0.4 },
  dividerText: { fontSize: 12, fontWeight: '800' },
  guestBtn: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  guestBtnText: { fontWeight: '900', fontSize: 14 },
  guestNote: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: Spacing.two },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.five },
  langChip: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  langText: { fontSize: 12, fontWeight: '800' },
  modalHeader: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  modalClose: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 24, letterSpacing: -1 },
  modalContent: { padding: Spacing.four, width: '100%', maxWidth: 720, alignSelf: 'center' },
  legalBody: { fontSize: 14, fontWeight: '500', lineHeight: 22 },
});
