import { useRouter } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PublicProfile } from '../lib/follows';

interface PersonRowProps {
  profile: PublicProfile;
  isSelf?: boolean;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  /** Small line under the handle, e.g. "12 mutual friends". */
  note?: string;
}

// Avatar + name + @handle row that links to the person's profile, with an
// optional Follow / Following toggle on the right. Shared by search and the
// followers / following lists.
export function PersonRow({ profile, isSelf, isFollowing, onToggleFollow, note }: PersonRowProps) {
  const colors = useTheme();
  const router = useRouter();
  const name = profile.display_name || profile.username || 'Student';

  return (
    <ShadowSurface
      backgroundColor={colors.backgroundElement}
      radius={14}
      offset={3}
      borderWidth={2}
      wrapperStyle={styles.wrap}
      style={styles.row}
      onPress={() => router.push(`/user?id=${profile.id}`)}
    >
      <View style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.accentYellow }]}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <ThemedText style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</ThemedText>
        )}
      </View>

      <View style={styles.info}>
        <ThemedText style={styles.name} numberOfLines={1}>{name}</ThemedText>
        <ThemedText style={styles.handle} themeColor="textSecondary" numberOfLines={1}>
          @{profile.username || 'username'}
        </ThemedText>
        {note ? (
          <ThemedText style={styles.note} themeColor="accentCyan" numberOfLines={1}>{note}</ThemedText>
        ) : null}
      </View>

      {!isSelf && onToggleFollow && (
        <ShadowSurface
          backgroundColor={isFollowing ? colors.backgroundElement : colors.accentPink}
          radius={10}
          offset={2}
          borderWidth={2}
          onPress={onToggleFollow}
          style={styles.followBtn}
        >
          <ThemedText style={[styles.followText, { color: isFollowing ? colors.text : '#000' }]}>
            {isFollowing ? 'Following' : 'Follow'}
          </ThemedText>
        </ShadowSurface>
      )}
    </ShadowSurface>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.two, gap: Spacing.two },
  avatar: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 18, fontWeight: '900', color: '#000' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '900' },
  handle: { fontSize: 12, fontWeight: '700' },
  note: { fontSize: 11, fontWeight: '800', marginTop: 1 },
  followBtn: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  followText: { fontWeight: '900', fontSize: 12 },
});
