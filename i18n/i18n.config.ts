import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';
// import * as Localization from 'expo-localization'; // uncomment when expo is installed

import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import es from './locales/es.json';
import darija from './locales/darija.json';

import gameEn from './locales/game/en.json';
import gameFr from './locales/game/fr.json';
import gameAr from './locales/game/ar.json';
import gameEs from './locales/game/es.json';
import gameDarija from './locales/game/darija.json';

export type SupportedLocale = 'en' | 'fr' | 'ar' | 'es' | 'darija';

export const RTL_LANGUAGES: SupportedLocale[] = ['ar', 'darija'];
export const LTR_LANGUAGES: SupportedLocale[] = ['fr', 'en', 'es'];

export const LANGUAGE_META: Record<
  SupportedLocale,
  { flag: string; nativeName: string; direction: 'rtl' | 'ltr' }
> = {
  ar: { flag: '\u{1F1F8}\u{1F1E6}', nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629', direction: 'rtl' },
  darija: { flag: '\u{1F1F2}\u{1F1E6}', nativeName: '\u0627\u0644\u062F\u0627\u0631\u062C\u0629', direction: 'rtl' },
  fr: { flag: '\u{1F1EB}\u{1F1F7}', nativeName: 'Fran\u00E7ais', direction: 'ltr' },
  en: { flag: '\u{1F1EC}\u{1F1E7}', nativeName: 'English', direction: 'ltr' },
  es: { flag: '\u{1F1EA}\u{1F1F8}', nativeName: 'Espa\u00F1ol', direction: 'ltr' },
};

const resources = {
  en: { common: en, game: gameEn },
  fr: { common: fr, game: gameFr },
  ar: { common: ar, game: gameAr },
  es: { common: es, game: gameEs },
  darija: { common: darija, game: gameDarija },
};

// Detect device locale, fallback to 'fr'
function getDeviceLocale(): SupportedLocale {
  // When expo-localization is available:
  // const deviceLocale = Localization.locale?.split('-')[0] ?? 'fr';
  const deviceLocale = 'fr'; // placeholder until expo-localization is wired up
  const supported: SupportedLocale[] = ['en', 'fr', 'ar', 'es', 'darija'];
  return supported.includes(deviceLocale as SupportedLocale)
    ? (deviceLocale as SupportedLocale)
    : 'fr';
}

const initialLocale = getDeviceLocale();

i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'fr',
  ns: ['common', 'game'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
  compatibilityJSON: 'v3',
});

/**
 * Change the app language and update RTL layout accordingly.
 */
export function changeLanguage(locale: SupportedLocale): void {
  const isRTL = RTL_LANGUAGES.includes(locale);
  I18nManager.forceRTL(isRTL);
  I18nManager.allowRTL(isRTL);
  i18n.changeLanguage(locale);
}

export function isRTLLocale(locale: string): boolean {
  return RTL_LANGUAGES.includes(locale as SupportedLocale);
}

export default i18n;
