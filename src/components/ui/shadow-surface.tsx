import { AccessibilityRole, StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface ShadowSurfaceProps {
  children: React.ReactNode;
  backgroundColor: string;
  onPress?: () => void;
  disabled?: boolean;
  radius?: number;
  offset?: number;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  wrapperStyle?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
}

// The app's recurring "neobrutalist" surface: a solid-border box offset over a
// same-shaped shadow block behind it. Used for every card and every raised
// button — only the color, radius, and offset distance change per call site.
export function ShadowSurface({
  children,
  backgroundColor,
  onPress,
  disabled,
  radius = 16,
  offset = 4,
  borderWidth = 3,
  style,
  wrapperStyle,
  activeOpacity = 0.9,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
}: ShadowSurfaceProps) {
  const theme = useTheme();
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <View style={[{ backgroundColor: theme.border, borderRadius: radius }, wrapperStyle]}>
      <Wrapper
        style={[
          {
            backgroundColor,
            borderWidth,
            borderColor: theme.border,
            borderRadius: radius,
            transform: [{ translateX: -offset }, { translateY: -offset }],
          },
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={onPress ? activeOpacity : undefined}
        accessible={onPress ? true : undefined}
        accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={onPress ? { disabled: !!disabled } : undefined}
      >
        {children}
      </Wrapper>
    </View>
  );
}
