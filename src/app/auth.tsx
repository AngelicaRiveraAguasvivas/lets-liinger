import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PRIVACY_TEXT, TERMS_TEXT } from '../lib/legal';
import { resolveSchoolFromEmail } from '../lib/school-auth';
import { supabase } from '../supabaseClient';

export default function AuthScreen() {
  const colors = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Age gate + Terms acceptance are required to create an account (store rule).
  const [is13, setIs13] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<null | 'terms' | 'privacy'>(null);

  async function handleSignUp() {
    setErrorMsg('');
    setInfoMsg('');

    if (!is13) {
      setErrorMsg('You must be 13 or older to create an account.');
      return;
    }
    if (!agreedTerms) {
      setErrorMsg('Please agree to the Terms and Privacy Policy to continue.');
      return;
    }

    setLoading(true);

    // Students-only gate: only school emails may create an account, and the
    // school is derived from the (verified) email domain — no self-reporting.
    const resolution = await resolveSchoolFromEmail(email);
    if (resolution.status === 'rejected') {
      setErrorMsg(resolution.message);
      setLoading(false);
      return;
    }
    const school = resolution.status === 'known' ? resolution.school : null;

    const { data, error } = await supabase.auth.signUp({
      email,
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
      setInfoMsg('Check your email to confirm your account, then sign in.');
    }
    // On success with a session, the root layout takes over and routes to onboarding
    setLoading(false);
  }

  async function handleSignIn() {
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMsg(error.message);
    }
    // On success, the root layout takes over and routes onward
    setLoading(false);
  }

  async function handleForgotPassword() {
    setErrorMsg('');
    setInfoMsg('');
    if (!email.trim()) {
      setErrorMsg('Enter your email above first, then tap “Forgot password”.');
      return;
    }
    const redirectTo =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/reset-password`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) setErrorMsg(error.message);
    else setInfoMsg('Password reset link sent — check your email.');
  }

  const legalText = legalDoc === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={[styles.title, { color: colors.text }]}>LetsLiinger</ThemedText>
          <ThemedText style={styles.subtitle} themeColor="textSecondary">
            See what&apos;s happenin
          </ThemedText>

          <TextField label="Email" placeholder="you@school.edu" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} />

          <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow}>
            <ThemedText style={[styles.forgot, { color: colors.accentCyan }]}>Forgot password?</ThemedText>
          </TouchableOpacity>

          {/* Age gate + Terms — required for account creation */}
          <View style={styles.checksWrap}>
            <Checkbox
              checked={is13}
              onToggle={() => setIs13((v) => !v)}
              borderColor={colors.border}
              checkColor={colors.accentGreen}
            >
              <ThemedText style={styles.checkLabel}>I&apos;m 13 years or older</ThemedText>
            </Checkbox>

            <Checkbox
              checked={agreedTerms}
              onToggle={() => setAgreedTerms((v) => !v)}
              borderColor={colors.border}
              checkColor={colors.accentGreen}
            >
              <ThemedText style={styles.checkLabel}>
                I agree to the{' '}
                <ThemedText style={[styles.link, { color: colors.accentCyan }]} onPress={() => setLegalDoc('terms')}>
                  Terms
                </ThemedText>{' '}
                and{' '}
                <ThemedText style={[styles.link, { color: colors.accentCyan }]} onPress={() => setLegalDoc('privacy')}>
                  Privacy Policy
                </ThemedText>
              </ThemedText>
            </Checkbox>
          </View>

          {errorMsg ? <ThemedText style={styles.error}>{errorMsg}</ThemedText> : null}
          {infoMsg ? (
            <ThemedText style={styles.info} themeColor="accentCyan">{infoMsg}</ThemedText>
          ) : null}

          <ShadowSurface
            backgroundColor={colors.accentYellow}
            radius={14}
            offset={3}
            wrapperStyle={styles.signInShadow}
            style={styles.btn}
            onPress={handleSignIn}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>{loading ? '...' : 'Sign In'}</ThemedText>
          </ShadowSurface>

          <ThemedText style={styles.schoolNote} themeColor="textSecondary">
            New here? Sign up with your school email — LetsLiinger is students only.
          </ThemedText>

          <ShadowSurface
            backgroundColor={colors.accentCyan}
            radius={14}
            offset={3}
            wrapperStyle={styles.signUpShadow}
            style={styles.btn}
            onPress={handleSignUp}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>Create Account</ThemedText>
          </ShadowSurface>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Legal text modal (works pre-auth, where in-app routes aren't reachable) */}
      <Modal visible={legalDoc !== null} animationType="slide" onRequestClose={() => setLegalDoc(null)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setLegalDoc(null)}>
              <ThemedText style={[styles.modalClose, { color: colors.text }]}>‹ back</ThemedText>
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
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  borderColor: string;
  checkColor: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onToggle} activeOpacity={0.7}>
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
  title: {
    fontFamily: 'Helvetica', fontWeight: '900',
    fontSize: 40, letterSpacing: -1, textAlign: 'center',
    // lineHeight + padding keep the heavy title from being clipped (mainly
    // an Android glyph-clipping issue with 900-weight text).
    lineHeight: 50, paddingVertical: 2,
  },
  subtitle: { textAlign: 'center', marginTop: Spacing.two, marginBottom: Spacing.six },
  forgotRow: { alignSelf: 'flex-end', marginTop: Spacing.two },
  forgot: { fontSize: 13, fontWeight: '800' },
  checksWrap: { marginTop: Spacing.four, gap: Spacing.two },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.two, marginTop: 1,
  },
  checkMark: { fontSize: 14, fontWeight: '900', color: '#000' },
  checkTextWrap: { flex: 1 },
  checkLabel: { fontSize: 13, fontWeight: '700', lineHeight: 20 },
  link: { fontWeight: '900', textDecorationLine: 'underline' },
  btn: { paddingVertical: Spacing.three, alignItems: 'center' },
  signInShadow: { marginTop: Spacing.five },
  schoolNote: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: Spacing.four },
  signUpShadow: { marginTop: Spacing.two },
  buttonText: { fontWeight: '900', color: '#000', fontSize: 14 },
  error: { color: '#ff6b6b', fontWeight: '700', marginTop: Spacing.three, textAlign: 'center' },
  info: { fontWeight: '700', marginTop: Spacing.three, textAlign: 'center' },
  modalHeader: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  modalClose: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 24, letterSpacing: -1 },
  modalContent: { padding: Spacing.four },
  legalBody: { fontSize: 14, fontWeight: '500', lineHeight: 22 },
});
