import { useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarSourceModal } from '@/components/avatar-source-modal';
import { ClubChipPicker } from '@/components/club-chip-picker';
import { SchoolPicker } from '@/components/school-picker';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useClubs } from '@/hooks/use-clubs';
import { useTheme } from '@/hooks/use-theme';
import { AvatarSource, pickAndCropAvatar, uploadAvatar } from '../lib/avatar';
import { checkClean } from '../lib/profanity';
import { supabase } from '../supabaseClient';

const INTEREST_OPTIONS = [
  'Music', 'Greek Life', 'Sports', 'Gaming / Esports', 'Art & Design',
  'Academic', 'Cultural', 'Volunteering', 'Business', 'Tech / Engineering',
  'Film & Media', 'Dance', 'Outdoors', 'Health & Wellness', 'Food',
];

export default function OnboardingScreen() {
  const colors = useTheme();
  const { clubs, create: createClub } = useClubs();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [university, setUniversity] = useState('');
  const [major, setMajor] = useState('');
  const [minor, setMinor] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [cohort, setCohort] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [myClubs, setMyClubs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  function toggleInterest(tag: string) {
    setInterests(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  function toggleClub(label: string) {
    setMyClubs(prev => (prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]));
  }

  async function handlePickAvatar(source: AvatarSource) {
    setAvatarMenuVisible(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const file = await pickAndCropAvatar(source);
    if (!file) return;
    setUploadingAvatar(true);
    const url = await uploadAvatar(user.id, file);
    setUploadingAvatar(false);
    if (url) setAvatarUrl(url);
  }

  async function handleSave() {
    setErrorMsg('');

    if (!displayName.trim()) {
      setErrorMsg('Please enter a name.');
      return;
    }
    if (!username.trim()) {
      setErrorMsg('Please pick a username.');
      return;
    }
    const badWord = checkClean(`${displayName} ${username} ${bio}`);
    if (badWord) {
      setErrorMsg(badWord);
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setErrorMsg('No signed-in user found. Try signing in again.');
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim().toLowerCase().replace(/\s+/g, '_'),
        bio: bio.trim(),
        university: university.trim() || null,
        major: major.trim() || null,
        minor: minor.trim() || null,
        grad_year: gradYear.trim() || null,
        cohort: cohort.trim() || null,
        avatar_url: avatarUrl,
        interests,
        extracurriculars: myClubs.map(name => ({ name, role: 'Member' })),
        onboarded: true,
        terms_accepted_at:
          (user.user_metadata as any)?.terms_accepted_at ?? new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      // 23505 = unique constraint violation (username already taken)
      setErrorMsg(
        error.code === '23505'
          ? 'That username is already taken — try another.'
          : error.message
      );
      setSaving(false);
      return;
    }

    // Mirror the flag onto the auth user so the session carries it.
    // This fires an auth-state-change event, which the root layout listens for.
    const { error: metaError } = await supabase.auth.updateUser({
      data: { onboarded: true },
    });

    if (metaError) {
      setErrorMsg(metaError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.title}>Set up your profile</ThemedText>
        <ThemedText style={styles.subtitle} themeColor="textSecondary">
          This is how other students will see you.
        </ThemedText>

        <View style={styles.avatarWrap}>
          <TouchableOpacity
            style={[styles.avatarCircle, { borderColor: colors.border, backgroundColor: colors.accentYellow }]}
            onPress={() => setAvatarMenuVisible(true)}
            activeOpacity={0.8}
          >
            {uploadingAvatar ? (
              <ActivityIndicator color="#000" />
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <ThemedText style={styles.avatarPlaceholder}>📷</ThemedText>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAvatarMenuVisible(true)}>
            <ThemedText style={styles.avatarBtnText} themeColor="accentCyan">
              {avatarUrl ? 'Change photo' : 'Add a photo'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <AvatarSourceModal
          visible={avatarMenuVisible}
          onClose={() => setAvatarMenuVisible(false)}
          onPick={handlePickAvatar}
        />

        <TextField label="Your name" value={displayName} onChangeText={setDisplayName} />

        <ThemedText style={styles.label} themeColor="accentCyan">Username</ThemedText>
        <View style={styles.usernameRow}>
          <ThemedText style={[styles.at, { color: colors.accentYellow }]}>@</ThemedText>
          <TextField containerStyle={styles.flex1} autoCapitalize="none" value={username} onChangeText={setUsername} />
        </View>

        <TextField
          label="Bio"
          multiline
          maxLength={160}
          style={styles.bioInput}
          value={bio}
          onChangeText={setBio}
        />
        <ThemedText style={styles.counter} themeColor="textSecondary">{bio.length}/160</ThemedText>

        <ThemedText style={styles.label} themeColor="accentCyan">School</ThemedText>
        <ThemedText style={styles.hint} themeColor="textSecondary">So classmates can find their people. All optional.</ThemedText>
        <SchoolPicker value={university} onChange={setUniversity} />
        <View style={styles.row2}>
          <TextField containerStyle={styles.flex1} label="Grad year" keyboardType="number-pad" value={gradYear} onChangeText={setGradYear} />
          <TextField containerStyle={styles.flex1} label="Cohort" value={cohort} onChangeText={setCohort} />
        </View>
        <View style={styles.row2}>
          <TextField containerStyle={styles.flex1} label="Major" value={major} onChangeText={setMajor} />
          <TextField containerStyle={styles.flex1} label="Minor" value={minor} onChangeText={setMinor} />
        </View>

        <ThemedText style={styles.label} themeColor="accentCyan">What are you into?</ThemedText>
        <ThemedText style={styles.hint} themeColor="textSecondary">Pick as many as you like.</ThemedText>
        <View style={styles.chipWrap}>
          {INTEREST_OPTIONS.map(tag => (
            <Chip key={tag} label={tag} selected={interests.includes(tag)} onPress={() => toggleInterest(tag)} />
          ))}
        </View>

        <ThemedText style={styles.label} themeColor="accentCyan">Your clubs</ThemedText>
        <ThemedText style={styles.hint} themeColor="textSecondary">Pick the clubs you&apos;re in — or add a new one.</ThemedText>
        <ClubChipPicker
          clubs={clubs}
          isSelected={(label) => myClubs.includes(label)}
          onToggle={toggleClub}
          onClubCreated={(created) => {
            const label = `${created.emoji ? `${created.emoji} ` : ''}${created.name}`;
            setMyClubs(prev => (prev.includes(label) ? prev : [...prev, label]));
          }}
          createClub={createClub}
        />

        {errorMsg ? <ThemedText style={styles.error}>{errorMsg}</ThemedText> : null}

        <ShadowSurface
          backgroundColor={colors.accentYellow}
          radius={12}
          offset={3}
          wrapperStyle={styles.submitShadow}
          style={styles.submitBtn}
          onPress={handleSave}
          disabled={saving}
        >
          <ThemedText style={styles.buttonText}>{saving ? 'Saving...' : "Let's go!"}</ThemedText>
        </ShadowSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  title: { fontSize: 30, fontWeight: '900', marginBottom: Spacing.one },
  subtitle: { fontSize: 14, marginBottom: Spacing.five },
  label: {
    fontSize: 12, fontWeight: '900', marginBottom: Spacing.two, marginTop: Spacing.three, letterSpacing: 0.5,
  },
  hint: { fontSize: 12, marginBottom: Spacing.two },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  at: { fontSize: 20, fontWeight: '900', marginRight: Spacing.two },
  flex1: { flex: 1 },
  row2: { flexDirection: 'row', gap: Spacing.two },
  bioInput: { height: 90, textAlignVertical: 'top' },
  counter: { fontSize: 11, textAlign: 'right', marginTop: Spacing.one },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.two },
  avatarWrap: { alignItems: 'center', marginBottom: Spacing.four },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 30 },
  avatarBtnText: { fontWeight: '900', fontSize: 12, marginTop: Spacing.two },
  submitShadow: { marginTop: Spacing.four },
  submitBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  buttonText: { textAlign: 'center', fontWeight: '900', color: '#000', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: Spacing.three, textAlign: 'center' },
});
