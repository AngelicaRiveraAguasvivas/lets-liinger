import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarSourceModal } from '@/components/avatar-source-modal';
import { DateTimeField } from '@/components/date-time-field';
import { PlaceSearchField } from '@/components/place-search-field';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useClubs } from '@/hooks/use-clubs';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { useUserCoords } from '@/hooks/use-user-coords';
import { useTheme } from '@/hooks/use-theme';
import { AvatarSource, pickAndCropImage, uploadEventCover } from '@/lib/avatar';
import { EVENT_CATEGORIES } from '@/lib/categories';
import { clubLabel } from '@/lib/clubs';
import { PlaceResult } from '@/lib/places';
import { checkClean } from '@/lib/profanity';
import { supabase } from '../supabaseClient';

const COVER_ASPECT = 16 / 9;

export interface EventFormInitialValues {
  title: string;
  description: string;
  host: string;
  location: string | null;
  eventTime: string | null;
  latitude: number | null;
  longitude: number | null;
  coverUrl?: string | null;
  category?: string | null;
  visibility?: string | null;
  capacity?: number | null;
}

export interface EventFormSubmitValues {
  title: string;
  description: string;
  host: string;
  place: PlaceResult;
  eventTimeIso: string;
  coverUrl: string | null;
  category: string | null;
  visibility: string;
  capacity: number | null;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceCount: number;
}

type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
const RECURRENCE_OPTIONS: { key: Recurrence; label: string }[] = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

interface EventFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialValues?: EventFormInitialValues;
  onClose: () => void;
  onSubmit: (values: EventFormSubmitValues) => Promise<{ error?: string } | void>;
  onSuccess: () => void;
}

function parseInitialPlace(v?: EventFormInitialValues): PlaceResult | null {
  if (!v || v.latitude == null || v.longitude == null) return null;
  return { name: v.location ?? '', lat: v.latitude, lng: v.longitude };
}

function parseInitialDate(v?: EventFormInitialValues): Date | null {
  const [datePart] = (v?.eventTime ?? '').split('T');
  if (!datePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseInitialTime(v?: EventFormInitialValues): Date | null {
  const [, timePart] = (v?.eventTime ?? '').split('T');
  if (!timePart || timePart === '00:00:00') return null;
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(1970, 0, 1, hh, mm);
}

function toEventTimeIso(date: Date, time: Date | null): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = time ? String(time.getHours()).padStart(2, '0') : '00';
  const mm = time ? String(time.getMinutes()).padStart(2, '0') : '00';
  return `${y}-${m}-${d}T${hh}:${mm}:00`;
}

// Shared create/edit event form. The two flows only differ in what happens on
// submit (insert vs. update), which the caller supplies via onSubmit.
export function EventFormModal({ visible, mode, initialValues, onClose, onSubmit, onSuccess }: EventFormModalProps) {
  const theme = useTheme();
  const { clubs, create: createClub } = useClubs();
  const { coords: userCoords } = useUserCoords();
  const place = usePlaceSearch(null, userCoords);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [host, setHost] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [myClubs, setMyClubs] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'school' | 'public'>('school');
  const [capacity, setCapacity] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [recurrenceCount, setRecurrenceCount] = useState('4');
  const [coverMenuVisible, setCoverMenuVisible] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function handlePickCover(source: AvatarSource) {
    setCoverMenuVisible(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const file = await pickAndCropImage(source, COVER_ASPECT);
    if (!file) return;
    setUploadingCover(true);
    const url = await uploadEventCover(user.id, file);
    setUploadingCover(false);
    if (url) setCoverUrl(url);
  }

  // Re-seed every time the modal opens: blank for "create", the event's
  // current values for "edit".
  useEffect(() => {
    if (!visible) return;
    setTitle(initialValues?.title ?? '');
    setDescription(initialValues?.description ?? '');
    setHost(initialValues?.host ?? '');
    setDate(parseInitialDate(initialValues));
    setTime(parseInitialTime(initialValues));
    setCoverUrl(initialValues?.coverUrl ?? null);
    setCategory(initialValues?.category ?? null);
    setVisibility((initialValues?.visibility as 'school' | 'public') ?? 'school');
    setCapacity(initialValues?.capacity != null ? String(initialValues.capacity) : '');
    setRecurrence('none');
    setRecurrenceCount('4');
    setFormError('');
    place.reset(parseInitialPlace(initialValues));
    // Pull the clubs the user belongs to (from their profile) so they show up
    // as one-tap host suggestions.
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('extracurriculars').eq('id', user.id).single();
      const names = ((data as any)?.extracurriculars ?? []).map((c: any) => c.name).filter(Boolean);
      setMyClubs(names);
    })();
    // Only re-seed when the modal transitions open, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleSubmit() {
    setFormError('');
    if (!title.trim()) {
      setFormError('Give your event a title.');
      return;
    }
    if (!date) {
      setFormError('Pick a date.');
      return;
    }
    if (!place.selected) {
      setFormError('Pick a location from the search results.');
      return;
    }
    const badWord = checkClean(`${title} ${description} ${host}`);
    if (badWord) {
      setFormError(badWord);
      return;
    }

    const capNum = capacity.trim() ? parseInt(capacity, 10) : NaN;

    setSaving(true);
    const result = await onSubmit({
      title: title.trim(),
      description: description.trim(),
      host: host.trim(),
      place: place.selected,
      eventTimeIso: toEventTimeIso(date, time),
      coverUrl,
      category,
      visibility,
      capacity: Number.isFinite(capNum) && capNum > 0 ? capNum : null,
      recurrence,
      recurrenceCount: Math.min(52, Math.max(1, parseInt(recurrenceCount, 10) || 1)),
    });
    setSaving(false);

    if (result?.error) {
      setFormError(result.error);
      return;
    }
    // Remember a freshly-typed club so it's suggested next time (for everyone).
    if (host.trim()) createClub(host.trim(), '');
    onSuccess();
    onClose();
  }

  // Your own clubs first, then any other clubs people have used before.
  const hostSuggestions = Array.from(new Set([...myClubs, ...clubs.map(clubLabel)]));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <ThemedText style={styles.cancel}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.title}>{mode === 'create' ? 'New event' : 'Edit event'}</ThemedText>
            <View style={styles.spacer} />
          </View>

          <ThemedText style={styles.label} themeColor="accentCyan">Cover photo (optional)</ThemedText>
          <TouchableOpacity
            style={[styles.coverBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
            onPress={() => setCoverMenuVisible(true)}
            activeOpacity={0.85}
          >
            {uploadingCover ? (
              <ActivityIndicator color={theme.text} />
            ) : coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImg} resizeMode="cover" />
            ) : (
              <ThemedText style={styles.coverHint} themeColor="textSecondary">＋ Add a cover photo</ThemedText>
            )}
          </TouchableOpacity>

          <TextField label="Title" value={title} onChangeText={setTitle} />

          <ThemedText style={styles.label} themeColor="accentCyan">Category</ThemedText>
          <View style={styles.clubSuggest}>
            {EVENT_CATEGORIES.map((c) => {
              const selected = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(selected ? null : c.key)}
                  style={[
                    styles.catChip,
                    { borderColor: theme.border, backgroundColor: selected ? c.color : theme.backgroundElement },
                  ]}
                >
                  <View style={[styles.catDot, { backgroundColor: c.color, borderColor: theme.border }]} />
                  <ThemedText style={[styles.catChipText, selected && { color: '#000' }]}>{c.label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextField
            label="Description"
            placeholder="What's the vibe?"
            multiline
            style={styles.multiline}
            value={description}
            onChangeText={setDescription}
          />

          <PlaceSearchField search={place} />

          <ThemedText style={styles.label} themeColor="accentCyan">Hosting club / org (optional)</ThemedText>
          {hostSuggestions.length > 0 && (
            <View style={styles.clubSuggest}>
              {hostSuggestions.map((label) => (
                <Chip key={label} label={label} selected={host === label} onPress={() => setHost(host === label ? '' : label)} />
              ))}
            </View>
          )}
          <TextField
            placeholder="Type a club or org…"
            value={host}
            onChangeText={setHost}
          />

          <ThemedText style={styles.label} themeColor="accentCyan">Who can see this?</ThemedText>
          <View style={styles.visRow}>
            <TouchableOpacity
              style={[styles.visChip, { borderColor: theme.border, backgroundColor: visibility === 'school' ? theme.accentGreen : theme.backgroundElement }]}
              onPress={() => setVisibility('school')}
            >
              <ThemedText style={[styles.visText, visibility === 'school' && { color: '#000' }]}>My school only</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.visChip, { borderColor: theme.border, backgroundColor: visibility === 'public' ? theme.accentCyan : theme.backgroundElement }]}
              onPress={() => setVisibility('public')}
            >
              <ThemedText style={[styles.visText, visibility === 'public' && { color: '#000' }]}>Everyone</ThemedText>
            </TouchableOpacity>
          </View>

          <TextField
            label="Max spots (optional)"
            placeholder="e.g. 50 — blank means unlimited"
            keyboardType="number-pad"
            value={capacity}
            onChangeText={setCapacity}
          />

          <ThemedText style={styles.label} themeColor="accentCyan">Date</ThemedText>
          <DateTimeField mode="date" value={date} onChange={setDate} placeholder="Pick a date" colors={theme} />

          <ThemedText style={styles.label} themeColor="accentCyan">Time (optional)</ThemedText>
          <DateTimeField mode="time" value={time} onChange={setTime} placeholder="Pick a time" colors={theme} />

          {mode === 'create' && (
            <>
              <ThemedText style={styles.label} themeColor="accentCyan">Repeats</ThemedText>
              <View style={styles.clubSuggest}>
                {RECURRENCE_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    onPress={() => setRecurrence(r.key)}
                    style={[styles.catChip, { borderColor: theme.border, backgroundColor: recurrence === r.key ? theme.accentGreen : theme.backgroundElement }]}
                  >
                    <ThemedText style={[styles.catChipText, recurrence === r.key && { color: '#000' }]}>{r.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              {recurrence !== 'none' && (
                <TextField
                  label={`How many ${recurrence === 'daily' ? 'days' : recurrence === 'weekly' ? 'weeks' : 'months'}?`}
                  placeholder="e.g. 4"
                  keyboardType="number-pad"
                  value={recurrenceCount}
                  onChangeText={setRecurrenceCount}
                />
              )}
            </>
          )}

          {formError ? <ThemedText style={styles.error}>{formError}</ThemedText> : null}

          <ShadowSurface
            backgroundColor={theme.accentYellow}
            radius={14}
            offset={3}
            wrapperStyle={styles.submitShadow}
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={saving}
          >
            <ThemedText style={styles.submitText}>
              {saving
                ? mode === 'create' ? 'Posting...' : 'Saving...'
                : mode === 'create' ? 'Post event' : 'Save changes'}
            </ThemedText>
          </ShadowSurface>
        </ScrollView>

        <AvatarSourceModal
          visible={coverMenuVisible}
          onClose={() => setCoverMenuVisible(false)}
          onPick={handlePickCover}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: 80 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.two,
  },
  cancel: { fontSize: 15, fontWeight: '700', width: 50 },
  title: { fontSize: 18, fontWeight: '900' },
  spacer: { width: 50 },
  multiline: { height: 80, textAlignVertical: 'top' },
  clubSuggest: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.two },
  coverBox: {
    width: '100%', aspectRatio: 16 / 9, borderWidth: 2, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: Spacing.two,
  },
  coverImg: { width: '100%', height: '100%' },
  coverHint: { fontSize: 14, fontWeight: '800' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.one,
    borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 5,
  },
  catDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  catChipText: { fontSize: 12, fontWeight: '800' },
  visRow: { flexDirection: 'row', gap: Spacing.two },
  visChip: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center' },
  visText: { fontSize: 13, fontWeight: '800' },
  label: {
    fontSize: 12, fontWeight: '900', marginBottom: Spacing.two, marginTop: Spacing.three, letterSpacing: 0.5,
  },
  submitShadow: { marginTop: Spacing.four },
  submitBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  submitText: { fontWeight: '900', color: '#000', fontSize: 16 },
  error: { color: '#ff6b6b', marginTop: Spacing.three, textAlign: 'center' },
});
