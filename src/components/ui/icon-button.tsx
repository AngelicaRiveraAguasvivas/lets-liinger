import { Image, ImageSourcePropType, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface IconButtonProps {
  emoji?: string;
  icon?: ImageSourcePropType;
  /** Draw a three-bar "menu" icon instead of an emoji or image. */
  menu?: boolean;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** What the button does, read out by screen readers (e.g. "Search"). */
  accessibilityLabel?: string;
}

// The small circular button used in every screen header — either an emoji
// glyph or a custom image icon (pass exactly one of `emoji` / `icon`).
export function IconButton({ emoji, icon, menu, onPress, size = 18, style, accessibilityLabel }: IconButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: theme.border }, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      {menu ? (
        <View style={[styles.menu, { width: size, height: size }]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.menuBar, { backgroundColor: theme.text }]} />
          ))}
        </View>
      ) : icon ? (
        <Image source={icon} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <ThemedText style={{ fontSize: size }}>{emoji}</ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: Spacing.two, borderRadius: 50, borderWidth: 2 },
  menu: { justifyContent: 'center', gap: 3.5, paddingHorizontal: 1 },
  menuBar: { height: 2.5, borderRadius: 2 },
});
