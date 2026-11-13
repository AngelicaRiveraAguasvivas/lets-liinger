import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useAppPrefs, useT } from '@/hooks/app-prefs-context';
import { useTheme } from '@/hooks/use-theme';
import type { TKey } from '@/lib/i18n';
import { clearReminders, describeOffset, getReminder, REMINDER_PRESETS, setReminders } from '@/lib/reminders';

type Unit = 'minutes' | 'hours' | 'days';
const UNIT_MIN: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 };

interface Props {
  event: { id: string; title: string; event_time: string | null };
  style?: object;
}

// "Remind me" button for an event. Opens a sheet where the person picks one
// or more times (presets or a custom "N minutes/hours/days before").
export function ReminderButton({ event, style }: Props) {
  const colors = useTheme();
  const { t } = useT();
  const { defaultReminder, reduceMotion } = useAppPrefs();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [customAmount, setCustomAmount] = useState('');
  const [customUnit, setCustomUnit] = useState<Unit>('hours');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getReminder(event.id);
    setActive(r?.offsets ?? []);
  }, [event.id]);

  useEffect(() => {
    let cancelled = false;
    getReminder(event.id).then((r) => {
      if (!cancelled) setActive(r?.offsets ?? []);
    });
    return () => { cancelled = true; };
  }, [event.id]);

  function openSheet() {
    setNote(event.event_time ? '' : t('reminderNoTime'));
    // Start from what's already set, or the default from Settings.
    setPicked(active.length ? active : defaultReminder != null ? [defaultReminder] : []);
    setCustomAmount('');
    setOpen(true);
  }

  function togglePick(min: number) {
    setPicked((p) => (p.includes(min) ? p.filter((x) => x !== min) : [...p, min]));
  }

  function addCustom() {
    const n = parseInt(customAmount, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    const min = n * UNIT_MIN[customUnit];
    setPicked((p) => (p.includes(min) ? p : [...p, min]));
    setCustomAmount('');
  }

  const units = { minutes: t('minutes'), hours: t('hours'), days: t('days') };
  const labelFor = (min: number) =>
    (REMINDER_PRESETS as readonly number[]).includes(min)
      ? t(`remind_${min}` as TKey)
      : `${describeOffset(min, units)} ${t('customBefore')}`;

  async function save() {
    setBusy(true);
    const res = await setReminders(event, picked, (o) =>
      o === 0
        ? t('reminderBodyStart', { title: event.title })
        : t('reminderBodySoon', { title: event.title, when: describeOffset(o, units) })
    );
    setBusy(false);
    if (res.error === 'denied') { setNote(t('reminderDenied')); return; }
    if (res.error === 'no-time') { setNote(t('reminderNoTime')); return; }
    await refresh();
    if (res.skippedPast > 0) { setNote(t('reminderPast')); return; }
    setOpen(false);
  }

  async function turnOff() {
    await clearReminders(event.id);
    await refresh();
    setOpen(false);
  }

  const customs = picked.filter((m) => !(REMINDER_PRESETS as readonly number[]).includes(m));

  return (
    <>
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.border, backgroundColor: active.length ? colors.accentYellow : 'transparent' }, style]}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={active.length ? t('remindersOn', { count: active.length }) : t('remindMe')}
      >
        <ThemedText style={[styles.btnText, active.length ? { color: '#000' } : null]}>
          ⏰ {active.length ? t('remindersOn', { count: active.length }) : t('remindMe')}
        </ThemedText>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={() => {}} style={styles.inner}>
            <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} style={styles.card}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <ThemedText style={styles.title} accessibilityRole="header">{t('remindersTitle')}</ThemedText>
                <ThemedText style={styles.sub} themeColor="textSecondary">{t('remindersSub')}</ThemedText>

                <View style={styles.chips}>
                  {REMINDER_PRESETS.map((min) => {
                    const on = picked.includes(min);
                    return (
                      <TouchableOpacity
                        key={min}
                        onPress={() => togglePick(min)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: on ? colors.accentGreen : 'transparent' }]}
                      >
                        <ThemedText style={[styles.chipText, on && { color: '#000' }]}>{on ? '✓ ' : ''}{labelFor(min)}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                  {customs.map((min) => (
                    <TouchableOpacity
                      key={min}
                      onPress={() => togglePick(min)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: true }}
                      style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.accentGreen }]}
                    >
                      <ThemedText style={[styles.chipText, { color: '#000' }]}>✓ {labelFor(min)}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>

                <ThemedText style={styles.label} themeColor="accentCyan">{t('custom')}</ThemedText>
                <View style={styles.customRow}>
                  <TextInput
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    keyboardType="number-pad"
                    accessibilityLabel={t('custom')}
                    style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  />
                  {(['minutes', 'hours', 'days'] as Unit[]).map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setCustomUnit(u)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: customUnit === u }}
                      style={[styles.unit, { borderColor: colors.border, backgroundColor: customUnit === u ? colors.accentCyan : 'transparent' }]}
                    >
                      <ThemedText style={[styles.chipText, customUnit === u && { color: '#000' }]}>{t(u)}</ThemedText>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={addCustom}
                    accessibilityRole="button"
                    style={[styles.unit, { borderColor: colors.border, backgroundColor: colors.accentPink }]}
                  >
                    <ThemedText style={[styles.chipText, { color: '#000' }]}>{t('add')}</ThemedText>
                  </TouchableOpacity>
                </View>

                {Platform.OS === 'web' ? (
                  <ThemedText style={styles.note} themeColor="textSecondary">{t('reminderWebNote')}</ThemedText>
                ) : null}
                {note ? <ThemedText style={styles.note} themeColor="accentCyan" accessibilityLiveRegion="polite">{note}</ThemedText> : null}

                <ShadowSurface
                  backgroundColor={colors.accentYellow}
                  radius={12}
                  offset={3}
                  wrapperStyle={{ marginTop: Spacing.three }}
                  style={styles.saveBtn}
                  onPress={busy || !event.event_time ? undefined : save}
                  disabled={busy || !event.event_time}
                >
                  <ThemedText style={styles.saveText}>{t('saveReminders')}</ThemedText>
                </ShadowSurface>
                {active.length > 0 ? (
                  <TouchableOpacity onPress={turnOff} style={styles.linkBtn} accessibilityRole="button">
                    <ThemedText style={styles.linkText}>{t('clearReminders')}</ThemedText>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setOpen(false)} style={styles.linkBtn} accessibilityRole="button">
                  <ThemedText style={styles.linkText}>{t('close')}</ThemedText>
                </TouchableOpacity>
              </ScrollView>
            </ShadowSurface>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { borderWidth: 2, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.two },
  btnText: { fontSize: 13, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  inner: { width: '100%', maxWidth: 460, maxHeight: '90%' },
  card: { padding: Spacing.four },
  title: { fontSize: 20, fontWeight: '900' },
  sub: { fontSize: 13, fontWeight: '600', marginTop: Spacing.one, marginBottom: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '900', marginTop: Spacing.four, marginBottom: Spacing.two, letterSpacing: 0.5 },
  customRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  input: { borderWidth: 2, borderRadius: 10, width: 64, paddingHorizontal: Spacing.two, paddingVertical: 8, fontSize: 15, fontWeight: '800' },
  unit: { borderWidth: 2, borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: 8 },
  note: { fontSize: 12, fontWeight: '600', marginTop: Spacing.three, lineHeight: 17 },
  saveBtn: { paddingVertical: Spacing.three, alignItems: 'center' },
  saveText: { color: '#000', fontWeight: '900', fontSize: 14 },
  linkBtn: { paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  linkText: { fontWeight: '900', fontSize: 13 },
});
