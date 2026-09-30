import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { passPayload } from '@/lib/checkin';

interface CheckinPassProps {
  visible: boolean;
  eventId: string;
  userId: string;
  eventTitle: string;
  onClose: () => void;
}

// An attendee's check-in pass: a QR the host scans at the door.
export function CheckinPass({ visible, eventId, userId, eventTitle, onClose }: CheckinPassProps) {
  const colors = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <ThemedText style={styles.title}>Your check-in pass</ThemedText>
          <ThemedText style={styles.sub} themeColor="textSecondary" numberOfLines={1}>{eventTitle}</ThemedText>
          <View style={styles.qrWrap}>
            <QRCode value={passPayload(eventId, userId)} size={220} backgroundColor="#fff" color="#000" />
          </View>
          <ThemedText style={styles.hint} themeColor="textSecondary">Show this to the host at the door.</ThemedText>
          <TouchableOpacity style={[styles.btn, { borderColor: colors.border }]} onPress={onClose}>
            <ThemedText style={styles.btnText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  card: { borderWidth: 3, borderRadius: 24, padding: Spacing.four, alignItems: 'center', width: '100%', maxWidth: 340 },
  title: { fontSize: 18, fontWeight: '900' },
  sub: { fontSize: 13, fontWeight: '700', marginTop: 2, marginBottom: Spacing.three },
  qrWrap: { backgroundColor: '#fff', padding: Spacing.three, borderRadius: 16 },
  hint: { fontSize: 12, fontWeight: '600', marginTop: Spacing.three, textAlign: 'center' },
  btn: { borderWidth: 2, borderRadius: 12, paddingVertical: Spacing.two, paddingHorizontal: Spacing.five, marginTop: Spacing.three },
  btnText: { fontWeight: '900', fontSize: 14 },
});
