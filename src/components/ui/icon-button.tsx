import { Image, ImageSourcePropType, StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface IconButtonProps {
  emoji?: string;
  icon?: ImageSourcePropType;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** What the button does, read out by screen readers (e.g. "Search"). */
  accessibilityLabel?: string;
}

// The small circular button used in every screen header — either an emoji
// glyph or a custom image icon (pass exactly one of `emoji` / `icon`).
export function IconButton({ emoji, icon, onPress, size = 18, style, accessibilityLabel }: IconButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btn, { borderColor: theme.border }, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      {icon ? (
        <Image source={icon} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <ThemedText style={{ fontSize: size }}>{emoji}</ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { padding: Spacing.two, borderRadius: 50, borderWidth: 2 },
});
