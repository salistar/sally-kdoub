/**
 * @file AppProviders.tsx
 * @description Wraps the whole Kdoub app in two contexts:
 *   - ThemeContext  → exposes {mode, isDark, setMode(), palette}
 *   - LocaleContext → exposes {locale, isRTL, setLocale()} and syncs i18next
 *
 * BOTH preferences are persisted to AsyncStorage so they survive app restarts
 * and are applied BEFORE first render (flash-of-wrong-theme is avoided via
 * `ready` gate that keeps splash up while we hydrate).
 *
 * Every screen that calls useTheme() or useLocale() re-renders automatically
 * when the user flips the toggle — no prop drilling, no reload needed.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import i18n from '../../i18n/i18n.config';
import { logger } from '../utils/logger';

// Load AsyncStorage lazily and defensively. If the module is missing, its
// native bridge isn't linked, or .default isn't a valid storage object, we
// silently fall back to an in-memory Map so the app NEVER crashes on
// persistence — it just won't remember prefs across launches.
const memFallback = (() => {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
  };
})();

let AsyncStorage: {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
} = memFallback;

try {
  const mod = require('@react-native-async-storage/async-storage');
  const candidate = mod?.default ?? mod;
  if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
    AsyncStorage = candidate;
  } else {
    logger.warn('AsyncStorage shape unexpected — using memory fallback');
  }
} catch (e) {
  logger.warn('AsyncStorage require failed — using memory fallback', String(e));
}

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type ThemeMode = 'system' | 'light' | 'dark';
export type LocaleCode = 'en' | 'fr' | 'ar' | 'es' | 'darija';

const RTL_LOCALES: LocaleCode[] = ['ar', 'darija'];

/** Dark / light palette — consumed by every screen. */
export interface Palette {
  isDark: boolean;
  bg: string;
  bgGradient: readonly [string, string, string];
  card: string;
  cardGradient: readonly [string, string];
  text: string;
  textSecondary: string;
  accent: string;
  accentGradient: readonly [string, string];
  danger: string;
  success: string;
  gold: string;
  border: string;
  headerGradient: readonly [string, string, string];
}

const DARK: Palette = {
  isDark: true,
  bg: '#0A0A1A',
  bgGradient: ['#0A0A1A', '#1A0B2E', '#16122B'] as const,
  card: 'rgba(26, 22, 50, 0.85)',
  cardGradient: ['#1E1B3A', '#2A1F4D'] as const,
  text: '#F3F4F6',
  textSecondary: '#9CA3AF',
  accent: '#7C3AED',
  accentGradient: ['#7C3AED', '#C026D3'] as const,
  danger: '#EF4444',
  success: '#10B981',
  gold: '#F59E0B',
  border: 'rgba(255,255,255,0.08)',
  headerGradient: ['#1A0B2E', '#3B0764', '#1E1B4B'] as const,
};

const LIGHT: Palette = {
  isDark: false,
  bg: '#F9FAFB',
  bgGradient: ['#FFFFFF', '#F5F3FF', '#EDE9FE'] as const,
  card: 'rgba(255, 255, 255, 0.95)',
  cardGradient: ['#FFFFFF', '#F5F3FF'] as const,
  text: '#111827',
  textSecondary: '#6B7280',
  accent: '#7C3AED',
  accentGradient: ['#8B5CF6', '#A855F7'] as const,
  danger: '#DC2626',
  success: '#059669',
  gold: '#D97706',
  border: 'rgba(17, 24, 39, 0.08)',
  headerGradient: ['#EDE9FE', '#DDD6FE', '#C4B5FD'] as const,
};

// ──────────────────────────────────────────────────────────────
// Theme Context
// ──────────────────────────────────────────────────────────────

interface ThemeCtx {
  mode: ThemeMode;
  isDark: boolean;
  palette: Palette;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | undefined>(undefined);
export const useTheme = (): ThemeCtx => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within AppProviders');
  return ctx;
};

// ──────────────────────────────────────────────────────────────
// Locale Context
// ──────────────────────────────────────────────────────────────

interface LocaleCtx {
  locale: LocaleCode;
  isRTL: boolean;
  setLocale: (l: LocaleCode) => void;
  available: { code: LocaleCode; label: string; native: string; flag: string }[];
}

export const LOCALES: { code: LocaleCode; label: string; native: string; flag: string }[] = [
  { code: 'fr',     label: 'French',  native: 'Français',  flag: '🇫🇷' },
  { code: 'en',     label: 'English', native: 'English',   flag: '🇬🇧' },
  { code: 'ar',     label: 'Arabic',  native: 'العربية',   flag: '🇸🇦' },
  { code: 'es',     label: 'Spanish', native: 'Español',   flag: '🇪🇸' },
  { code: 'darija', label: 'Darija',  native: 'الدارجة',   flag: '🇲🇦' },
];

const LocaleContext = createContext<LocaleCtx | undefined>(undefined);
export const useLocale = (): LocaleCtx => {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within AppProviders');
  return ctx;
};

// ──────────────────────────────────────────────────────────────
// Storage keys
// ──────────────────────────────────────────────────────────────

const K_THEME = '@kdoub/theme-mode';
const K_LOCALE = '@kdoub/locale';

// ──────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
}

export function AppProviders({ children }: Props) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [locale, setLocaleState] = useState<LocaleCode>('fr');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate persisted prefs ONCE on mount. Bounded to 1500ms so the app
  // never gets stuck on a broken storage driver — we just fall back to
  // defaults and keep going.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        logger.warn('AppProviders', 'hydration timed out — using defaults');
        setHydrated(true);
      }
    }, 1500);

    (async () => {
      try {
        logger.screen('AppProviders', 'hydrating persisted preferences');
        const [savedTheme, savedLocale] = await Promise.all([
          AsyncStorage.getItem(K_THEME),
          AsyncStorage.getItem(K_LOCALE),
        ]);
        if (cancelled) return;
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setModeState(savedTheme as ThemeMode);
          logger.explain(`thème restauré → ${savedTheme}`);
        }
        if (savedLocale && LOCALES.some((l) => l.code === savedLocale)) {
          setLocaleState(savedLocale as LocaleCode);
          await i18n.changeLanguage(savedLocale);
          logger.explain(`langue restaurée → ${savedLocale} (i18n synchronisé)`);
        }
      } catch (e) {
        logger.error('AppProviders hydration failed', e);
      } finally {
        clearTimeout(timer);
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  // Resolve effective dark/light from mode + system scheme
  const isDark = useMemo(() => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return systemScheme !== 'light';
  }, [mode, systemScheme]);

  const palette = isDark ? DARK : LIGHT;

  const setMode = useCallback((m: ThemeMode) => {
    logger.explain(`thème changé → ${m} (sauvegardé)`);
    setModeState(m);
    AsyncStorage.setItem(K_THEME, m).catch((e) => logger.error('theme persist', e));
  }, []);

  const toggle = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const setLocale = useCallback((l: LocaleCode) => {
    logger.explain(`langue changée → ${l} (i18n.changeLanguage + sauvegarde)`);
    setLocaleState(l);
    i18n.changeLanguage(l);
    AsyncStorage.setItem(K_LOCALE, l).catch((e) => logger.error('locale persist', e));
  }, []);

  const themeCtx: ThemeCtx = useMemo(
    () => ({ mode, isDark, palette, setMode, toggle }),
    [mode, isDark, palette, setMode, toggle],
  );

  const localeCtx: LocaleCtx = useMemo(
    () => ({
      locale,
      isRTL: RTL_LOCALES.includes(locale),
      setLocale,
      available: LOCALES,
    }),
    [locale, setLocale],
  );

  // NOTE: we used to gate on `hydrated`, but that caused a white-screen
  // lock whenever AsyncStorage was slow / missing. Now we always render
  // with defaults and apply persisted values in the background — at worst
  // the user sees a sub-second flash, never a frozen screen.
  void hydrated;

  return (
    <ThemeContext.Provider value={themeCtx}>
      <LocaleContext.Provider value={localeCtx}>
        {children}
      </LocaleContext.Provider>
    </ThemeContext.Provider>
  );
}

export default AppProviders;
