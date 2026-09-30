import { useEffect, useState } from 'react';
import { Modal, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { REPORT_REASONS } from '@/lib/moderation';

interface ReportModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSubmit: (category: string, detail: string) => void;
}

// Reusable "report" sheet: pick a reason, add optional detail. Used for
// reporting a user (and reusable for events). Keeps the categories in sync
// with the server's auto-shadow-ban logic via REPORT_REASONS.
export function ReportModal({ visible, title = 'Report', onClose, onSubmit }: ReportModalProps) {
  const colors = useTheme();
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (visible) { setCategory(null); setDetail(''); }
  }, [visible]);

  const canSubmit = !!category;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={styles.sub} themeColor="textSecondary">
            What&apos;s going on? Your report is anonymous and reviewed by our team.
          </ThemedText>

          <View style={styles.reasons}>
            {REPORT_REASONS.map((r) => {
              const on = category === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setCategory(r.key)}
                  style={[styles.reason, { borderColor: colors.border, backgroundColor: on ? colors.accentPink : 'transparent' }]}
                >
                  <ThemedText style={[styles.reasonText, on && styles.reasonTextOn]}>{r.label}</ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.detail, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
            placeholder="Add details (optional)…"
            placeholderTextColor={colors.textSecondary}
            value={detail}
            onChangeText={setDetail}
            multiline
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, { borderColor: colors.border, backgroundColor: colors.backgroundElement }]}
              onPress={onClose}
            >
              <ThemedText style={styles.btnText}>Cancel</ThemedText>
            </TouchableOpacity>
            <ShadowSurface
              backgroundColor={canSubmit ? colors.accentPink : colors.backgroundElement}
              radius={12}
              offset={2}
              borderWidth={2}
              style={styles.submit}
              onPress={() => { if (canSubmit && category) onSubmit(category, detail); }}
            >
              <ThemedText style={[styles.btnText, canSubmit && { color: '#000' }]}>Submit report</ThemedText>
            </ShadowSurface>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.four },
  card: { borderWidth: 3, borderRadius: 20, padding: Spacing.four },
  title: { fontSize: 18, fontWeight: '900', marginBottom: Spacing.one },
  sub: { fontSize: 12, fontWeight: '600', lineHeight: 17, marginBottom: Spacing.three },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  reason: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  reasonText: { fontSize: 12, fontWeight: '800' },
  reasonTextOn: { color: '#000' },
  detail: { borderWidth: 2, borderRadius: 12, padding: Spacing.three, height: 70, textAlignVertical: 'top', fontSize: 14 },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  btn: { flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, alignItems: 'center' },
  submit: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center' },
  btnText: { fontWeight: '900', fontSize: 14 },
});
