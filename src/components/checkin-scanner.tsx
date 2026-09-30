import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parsePass } from '@/lib/checkin';

interface CheckinScannerProps {
  visible: boolean;
  eventId: string;
  onClose: () => void;
  onScanned: (userId: string) => void; // called with the scanned attendee's id
}

// Host-facing QR scanner. Native only (needs the camera); on web we tell the
// host to use the manual check-in list instead.
export function CheckinScanner({ visible, eventId, onClose, onScanned }: CheckinScannerProps) {
  const colors = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [msg, setMsg] = useState('');
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  function handleScan(result: { data: string }) {
    const now = Date.now();
    // Debounce repeated reads of the same code.
    if (result.data === lastRef.current.code && now - lastRef.current.at < 2500) return;
    lastRef.current = { code: result.data, at: now };
    const pass = parsePass(result.data);
    if (!pass) { setMsg('Not a check-in pass.'); return; }
    if (pass.e !== eventId) { setMsg('That pass is for a different event.'); return; }
    onScanned(pass.u);
    setMsg('✓ Checked in!');
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topRow}>
          <ThemedText style={styles.title}>Scan passes</ThemedText>
          <TouchableOpacity onPress={onClose}>
            <ThemedText style={[styles.close, { color: colors.text }]}>Done</ThemedText>
          </TouchableOpacity>
        </View>

        {Platform.OS === 'web' ? (
          <ThemedText style={styles.note} themeColor="textSecondary">
            Camera scanning is available in the iOS/Android app. On the web, check attendees in from the list on the event.
          </ThemedText>
        ) : !permission ? (
          <ThemedText style={styles.note} themeColor="textSecondary">Requesting camera…</ThemedText>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <ThemedText style={styles.note} themeColor="textSecondary">We need camera access to scan passes.</ThemedText>
            <TouchableOpacity style={[styles.btn, { borderColor: colors.border, backgroundColor: colors.accentGreen }]} onPress={requestPermission}>
              <ThemedText style={styles.btnText}>Allow camera</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        )}

        {msg ? <ThemedText style={[styles.msg, { color: colors.accentGreen }]}>{msg}</ThemedText> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three },
  title: { fontSize: 20, fontWeight: '900' },
  close: { fontSize: 16, fontWeight: '900' },
  camera: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three },
  note: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: Spacing.four },
  btn: { borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, paddingHorizontal: Spacing.five },
  btnText: { fontWeight: '900', fontSize: 14, color: '#000' },
  msg: { fontSize: 15, fontWeight: '900', textAlign: 'center', marginTop: Spacing.three },
});
