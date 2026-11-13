import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { Lang, TKey, localeFor, translate } from '@/lib/i18n';

// Device-level preferences that don't need an account: accent tone, language,
// accessibility options, the default reminder time, and whether the person is
// browsing in guest mode. Saved to AsyncStorage (localStorage on web).

export type TextScale = 1 | 1.15 | 1.3;

export interface AppPrefs {
  accentHue: number | null; // null = original Y2K colors
  language: Lang;
  textScale: TextScale;
  highContrast: boolean;
  reduceMotion: boolean;
  defaultReminder: number | null; // minutes before the event, null = none preselected
  isGuest: boolean;
}

const DEFAULTS: AppPrefs = {
  accentHue: null,
  language: 'en',
  textScale: 1,
  highContrast: false,
  reduceMotion: false,
  defaultReminder: 60,
  isGuest: false,
};

const STORAGE_KEY = 'letsliinger:prefs:v1';
const isServer = typeof window === 'undefined';

interface Ctx extends AppPrefs {
  loaded: boolean;
  update: (patch: Partial<AppPrefs>) => void;
}

const AppPrefsContext = createContext<Ctx>({ ...DEFAULTS, loaded: false, update: () => {} });

export function AppPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(isServer);

  useEffect(() => {
    if (isServer) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Save shortly after the last change, so dragging the color slider (which
  // updates many times a second) only writes to storage once it settles.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((patch: Partial<AppPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      if (!isServer) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        }, 250);
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, loaded, update }), [prefs, loaded, update]);
  return <AppPrefsContext.Provider value={value}>{children}</AppPrefsContext.Provider>;
}

export function useAppPrefs() {
  return useContext(AppPrefsContext);
}

// t('key') in the active language, plus the matching locale for dates.
export function useT() {
  const { language } = useAppPrefs();
  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language]
  );
  return { t, lang: language, locale: localeFor(language) };
}

export function useIsGuest() {
  return useAppPrefs().isGuest;
}
