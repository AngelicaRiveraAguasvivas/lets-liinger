import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { School, addSchool, fetchSchools } from '@/lib/schools';

// Searchable school picker that keeps `university` a normalized value (so
// school-scoping actually matches). Type to filter the shared list; pick one,
// or add your school if it isn't listed yet.
export function SchoolPicker({
  value, onChange, label = 'University',
}: {
  value: string;
  onChange: (name: string) => void;
  label?: string;
}) {
  const colors = useTheme();
  const [all, setAll] = useState<School[]>([]);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => { fetchSchools().then(setAll); }, []);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  const matches = trimmed
    ? all.filter((s) => s.name.toLowerCase().includes(lower)).slice(0, 8)
    : all.slice(0, 8);
  const exact = all.some((s) => s.name.toLowerCase() === lower);
  const selected = value.trim().toLowerCase() === lower && !!trimmed;

  function pick(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  async function addNew() {
    const s = await addSchool(trimmed);
    if (s) {
      setAll((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
      pick(s.name);
    }
  }

  return (
    <View>
      <TextField
        label={label}
        placeholder="Start typing your school…"
        value={query}
        onChangeText={(t) => { setQuery(t); onChange(''); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoCapitalize="words"
      />
      {selected ? (
        <ThemedText style={styles.hint} themeColor="textSecondary">✓ {value}</ThemedText>
      ) : null}

      {open && trimmed.length > 0 && !selected && (
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}>
          {matches.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.row, i < matches.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={() => pick(s.name)}
            >
              <ThemedText style={styles.rowText}>{s.name}</ThemedText>
            </TouchableOpacity>
          ))}
          {!exact && (
            <TouchableOpacity style={styles.row} onPress={addNew}>
              <ThemedText style={[styles.rowText, { color: colors.accentCyan }]}>＋ Add “{trimmed}”</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, fontWeight: '700', marginTop: Spacing.one },
  list: { borderWidth: 2, borderRadius: 12, marginTop: Spacing.two, overflow: 'hidden' },
  row: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  rowText: { fontSize: 14, fontWeight: '700' },
});
