import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  dashed?: boolean;
  onPress?: () => void;
  selectedColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

// Pill-shaped selectable chip used for sort options, filters, interests, and
// club pickers. Selected text switches to black to stay legible against the
// bright accent colors, matching how the app renders text on every other
// colored button.
export function Chip({ label, selected, dashed, onPress, selectedColor, style, accessibilityLabel }: ChipProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { borderColor: theme.border, backgroundColor: theme.backgroundElement },
        dashed && styles.dashed,
        selected && { backgroundColor: selectedColor ?? theme.accentPink },
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <ThemedText style={[styles.text, selected && styles.textSelected]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 9,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 2,
  },
  dashed: { borderStyle: 'dashed' },
  text: { fontWeight: '900', fontSize: 12 },
  textSelected: { color: '#000' },
});
