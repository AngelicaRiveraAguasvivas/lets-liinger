// Turns one user-picked hue (0-360) into the four accent colors the app uses.
// Every screen reads accentPink / accentCyan / accentYellow / accentGreen from
// useTheme(), so swapping these four values re-tints the whole app.

export interface AccentSet {
  accentPink: string;
  accentCyan: string;
  accentYellow: string;
  accentGreen: string;
}

export const DEFAULT_ACCENTS: AccentSet = {
  accentPink: '#FF007F',
  accentCyan: '#00F0FF',
  accentYellow: '#FFC72C',
  accentGreen: '#39FF14',
};

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

// Main tone + three neighbors on the color wheel. The neighbors stay close to
// the chosen tone (so the app clearly "goes by" it) but are far enough apart
// that states like RSVP vs RSVP'd are still easy to tell apart. Lightness is
// kept high enough that the black button text stays readable.
export function accentsFromHue(hue: number): AccentSet {
  return {
    accentPink: hslToHex(hue, 100, 60),
    accentCyan: hslToHex(hue + 35, 95, 68),
    accentYellow: hslToHex(hue - 35, 95, 66),
    accentGreen: hslToHex(hue + 70, 90, 62),
  };
}

// Quick picks shown under the slider.
export const PRESET_HUES: { hue: number; name: string }[] = [
  { hue: 330, name: 'Bubblegum' },
  { hue: 280, name: 'Grape' },
  { hue: 200, name: 'Sky' },
  { hue: 160, name: 'Mint' },
  { hue: 45, name: 'Sunny' },
  { hue: 10, name: 'Cherry' },
];
