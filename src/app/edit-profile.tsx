import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getMyPhone, setMyPhone } from '../lib/contacts';
import { buildProfileUpdate } from '../lib/profile';
import { supabase } from '../supabaseClient';

const INTEREST_OPTIONS = [
  'Music', 'Greek Life', 'Sports', 'Gaming / Esports', 'Art & Design',
  'Academic', 'Cultural', 'Volunteering', 'Business', 'Tech / Engineering',
  'Film & Media', 'Dance', 'Outdoors', 'Health & Wellness', 'Food',
];

export default function EditProfileScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { clubs, create: createClub } = useClubs();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [university, setUniversity] = useState('');
  const [schoolLocked, setSchoolLocked] = useState(false);
  const [major, setMajor] = useState('');
  const [minor, setMinor] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMenuVisible, setAvatarMenuVisible] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [extracurriculars, setExtracurriculars] = useState<{ name: string; role: string }[]>([]);

  const [pickedClub, setPickedClub] = useState('');
  const [newRole, setNewRole] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingProfile(false);
        return;
      }
      setUserId(user.id);
      const meta = (user.user_metadata ?? {}) as any;
      if (meta.school_locked) setSchoolLocked(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, username, bio, avatar_url, interests, extracurriculars, university, major, minor, grad_year, cohort')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setDisplayName(data.display_name ?? '');
        setUsername(data.username ?? '');
        setBio(data.bio ?? '');
        setUniversity(data.university ?? '');
        setMajor(data.major ?? '');
        setMinor(data.minor ?? '');
        setGradYear(data.grad_year ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        setInterests(data.interests ?? []);
        setExtracurriculars(data.extracurriculars ?? []);
      }
      setPhone((await getMyPhone(user.id)) ?? '');
      setLoadingProfile(false);
    }
    load();
  }, []);

  async function handlePickAvatar(source: AvatarSource) {
    setAvatarMenuVisible(false);
    if (!userId) return;
    const file = await pickAndCropAvatar(source);
    if (!file) return;
    setUploadingAvatar(true);
    const url = await uploadAvatar(userId, file);
    setUploadingAvatar(false);
    if (url) setAvatarUrl(url);
    else setErrorMsg('Could not upload that image. Try a different file.');
  }

  function toggleInterest(tag: string) {
    setInterests(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  }

  function addExtracurricular() {
    if (!pickedClub || !newRole.trim()) return;
    if (extracurriculars.some(e => e.name === pickedClub)) {
      setPickedClub('');
      setNewRole('');
      return;
    }
    setExtracurriculars(prev => [...prev, { name: pickedClub, role: newRole.trim() }]);
    setPickedClub('');
    setNewRole('');
  }

  function removeExtracurricular(index: number) {
    setExtracurriculars(prev => prev.filter((_, i) => i !== index));
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
    if (!university.trim()) {
      setErrorMsg('Please select your university.');
      return;
    }
    if (!gradYear.trim()) {
      setErrorMsg('Please enter your graduation year.');
      return;
    }
    if (!major.trim()) {
      setErrorMsg('Please enter your major.');
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
      .update(buildProfileUpdate(
        { displayName, username, bio, university, major, minor, gradYear, avatarUrl, interests, extracurriculars },
        { schoolLocked, lockedUniversity: university }
      ))
      .eq('id', user.id);

    if (error) {
      setErrorMsg(error.code === '23505' ? 'That username is already taken — try another.' : error.message);
      setSaving(false);
      return;
    }

    // Phone lives in its own private table (never on the public profile).
    const phoneErr = await setMyPhone(user.id, phone);
    if (phoneErr) {
      setErrorMsg(phoneErr);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace('/profile');
  }

  if (loadingProfile) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}>
            <ThemedText style={[styles.headerText, { color: colors.text }]}>‹ back</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedText style={[styles.headerText, { color: colors.text }]}>Edit profile</ThemedText>

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
          <TouchableOpacity
            style={[styles.changeAvatarBtn, { borderColor: colors.border, backgroundColor: colors.accentCyan }]}
            onPress={() => setAvatarMenuVisible(true)}
          >
            <ThemedText style={styles.smallBtnText}>{avatarUrl ? 'Change photo' : 'Add photo'}</ThemedText>
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
          <TextField
            containerStyle={styles.flex1}
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <TextField
          label="Bio"
          multiline
          maxLength={160}
          style={styles.bioInput}
          value={bio}
          onChangeText={setBio}
        />
        <ThemedText style={styles.counter}>{bio.length}/160</ThemedText>

        {schoolLocked ? (
          <>
            <ThemedText style={styles.label} themeColor="accentCyan">University</ThemedText>
            <View style={[styles.lockedField, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
              <ThemedText style={styles.lockedText}>{university}</ThemedText>
              <ThemedText style={styles.lockedNote} themeColor="textSecondary">Verified from your school email</ThemedText>
            </View>
          </>
        ) : (
          <SchoolPicker value={university} onChange={setUniversity} />
        )}
        <TextField label="Grad year" placeholder="2028" keyboardType="number-pad" value={gradYear} onChangeText={setGradYear} />
        <View style={styles.row2}>
          <TextField containerStyle={styles.flex1} label="Major" value={major} onChangeText={setMajor} />
          <TextField containerStyle={styles.flex1} label="Minor (optional)" value={minor} onChangeText={setMinor} />
        </View>

        <TextField
          label="Phone (optional)"
          placeholder="(555) 123-4567"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <ThemedText style={styles.hint} themeColor="textSecondary">
          Private — never shown on your profile. Only used so friends who have your number can find you. Leave blank to skip.
        </ThemedText>

        <ThemedText style={styles.label} themeColor="accentCyan">What are you into?</ThemedText>
        <View style={styles.chipWrap}>
          {INTEREST_OPTIONS.map(tag => (
            <Chip key={tag} label={tag} selected={interests.includes(tag)} onPress={() => toggleInterest(tag)} />
          ))}
        </View>

        <ThemedText style={styles.label} themeColor="accentCyan">My clubs</ThemedText>
        {extracurriculars.map((item, index) => (
          <View key={`${item.name}-${index}`} style={[styles.clubRow, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
            <ThemedText style={styles.clubRowText}>
              {item.name} <ThemedText style={styles.clubRowRole} themeColor="textSecondary">— {item.role}</ThemedText>
            </ThemedText>
            <TouchableOpacity onPress={() => removeExtracurricular(index)}>
              <ThemedText style={[styles.removeText, { color: colors.accentPink }]}>✕</ThemedText>
            </TouchableOpacity>
          </View>
        ))}

        <ThemedText style={styles.subLabel} themeColor="textSecondary">Pick a club</ThemedText>
        <ClubChipPicker
          clubs={clubs}
          isSelected={(label) => pickedClub === label}
          onToggle={(label) => setPickedClub(pickedClub === label ? '' : label)}
          onClubCreated={(created) => setPickedClub(`${created.emoji ? `${created.emoji} ` : ''}${created.name}`)}
          createClub={createClub}
        />

        <TextField placeholder="Your role (e.g. Member)" containerStyle={styles.roleField} value={newRole} onChangeText={setNewRole} />

        <ShadowSurface
          backgroundColor={colors.accentGreen}
          radius={12}
          offset={2}
          wrapperStyle={styles.addBtnShadow}
          style={styles.addBtn}
          onPress={addExtracurricular}
        >
          <ThemedText style={styles.addBtnText}>+ ADD CLUB TO PROFILE</ThemedText>
        </ShadowSurface>

        {errorMsg ? <ThemedText style={styles.error}>{errorMsg}</ThemedText> : null}

        <ShadowSurface
          backgroundColor={colors.accentYellow}
          radius={14}
          offset={3}
          wrapperStyle={styles.saveBtnShadow}
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={saving}
        >
          <ThemedText style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save changes'}</ThemedText>
        </ShadowSurface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 80 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: Spacing.three },
  headerText: { fontFamily: 'ui-rounded', fontWeight: '900', fontSize: 24, letterSpacing: -1 },
  avatarWrap: { alignItems: 'center', marginTop: Spacing.three },
  avatarCircle: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 32 },
  changeAvatarBtn: {
    marginTop: Spacing.two, borderWidth: 2, borderRadius: 10,
    paddingVertical: Spacing.one, paddingHorizontal: Spacing.three,
  },
  smallBtnText: { fontWeight: '900', fontSize: 12, color: '#000' },
  label: {
    fontSize: 12, fontWeight: '900', marginBottom: Spacing.two, marginTop: Spacing.three, letterSpacing: 0.5,
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  at: { fontSize: 20, fontWeight: '900', marginRight: Spacing.two },
  flex1: { flex: 1 },
  row2: { flexDirection: 'row', gap: Spacing.two },
  hint: { fontSize: 12, marginTop: Spacing.one, marginBottom: Spacing.two },
  lockedField: { borderWidth: 2, borderRadius: 12, padding: Spacing.three },
  lockedText: { fontSize: 15, fontWeight: '800' },
  lockedNote: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  bioInput: { height: 90, textAlignVertical: 'top' },
  counter: { fontSize: 11, opacity: 0.6, textAlign: 'right', marginTop: Spacing.one },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  subLabel: { fontSize: 11, fontWeight: '800', marginTop: Spacing.three, marginBottom: Spacing.two },
  clubRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 2, borderRadius: 12,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, marginBottom: Spacing.two,
  },
  clubRowText: { fontWeight: '900', fontSize: 14 },
  clubRowRole: { fontWeight: '600', fontSize: 13 },
  removeText: { fontWeight: '900', fontSize: 16 },
  roleField: { marginTop: Spacing.two },
  addBtnShadow: { marginTop: Spacing.two },
  addBtn: { paddingVertical: Spacing.two, alignItems: 'center' },
  addBtnText: { fontWeight: '900', fontSize: 13, letterSpacing: 0.5, color: '#000' },
  saveBtnShadow: { marginTop: Spacing.four },
  saveBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  saveBtnText: { textAlign: 'center', fontWeight: '900', color: '#000', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: Spacing.three, textAlign: 'center' },
});
