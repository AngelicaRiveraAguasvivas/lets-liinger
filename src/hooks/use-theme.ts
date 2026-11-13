/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useMemo } from 'react';

import { Colors } from '@/constants/theme';
import { useAppPrefs } from '@/hooks/app-prefs-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { accentsFromHue } from '@/lib/accent';

// The base palette, with the person's chosen accent tone and high-contrast
// setting layered on top. Every screen gets its colors from here, so these
// settings apply app-wide.
export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  const { accentHue, highContrast } = useAppPrefs();

  return useMemo(() => {
    const base = Colors[theme];
    const accents = accentHue == null
      ? {}
      : (() => {
          const a = accentsFromHue(accentHue);
          return theme === 'dark' ? { ...a, backgroundSelected: a.accentGreen } : a;
        })();
    const contrast = highContrast
      ? theme === 'dark'
        ? { textSecondary: '#E6E6E6', border: '#FFFFFF' }
        : { textSecondary: '#000000', border: '#000000' }
      : {};
    return { ...base, ...accents, ...contrast };
  }, [theme, accentHue, highContrast]);
}
