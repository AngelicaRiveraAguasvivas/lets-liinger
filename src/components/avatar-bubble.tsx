import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

// A small circular avatar: shows the photo, or the first letter of the name as
// a fallback. Reused next to usernames across the app. When `userId` is passed
// it becomes tappable and opens that person's profile.
export function AvatarBubble({
  url, name, size = 32, bg, userId,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  bg?: string;
  userId?: string | null;
}) {
  const colors = useTheme();
  const router = useRouter();
  const letter = (name || '?').replace(/^@/, '').charAt(0).toUpperCase() || '?';

  const circle = (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, borderColor: colors.border, backgroundColor: bg ?? colors.accentYellow },
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.img} resizeMode="cover" />
      ) : (
        <ThemedText style={[styles.letter, { fontSize: Math.round(size * 0.42) }]}>{letter}</ThemedText>
      )}
    </View>
  );

  if (!userId) return circle;
  return (
    <Pressable onPress={() => router.push(`/user?id=${userId}`)} hitSlop={4}>
      {circle}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  letter: { fontWeight: '900', color: '#000' },
});
