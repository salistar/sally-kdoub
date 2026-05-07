import type { SupportedLocale } from './i18n.config';

// Eastern Arabic numerals mapping
const EASTERN_ARABIC_NUMERALS = [
  '\u0660', // ٠
  '\u0661', // ١
  '\u0662', // ٢
  '\u0663', // ٣
  '\u0664', // ٤
  '\u0665', // ٥
  '\u0666', // ٦
  '\u0667', // ٧
  '\u0668', // ٨
  '\u0669', // ٩
] as const;

const LATIN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Convert a number to Eastern Arabic numeral string.
 * Example: 42 -> "٤٢"
 */
export function toArabicNumerals(n: number): string {
  return String(n)
    .split('')
    .map((ch) => {
      const digit = parseInt(ch, 10);
      return isNaN(digit) ? ch : EASTERN_ARABIC_NUMERALS[digit];
    })
    .join('');
}

/**
 * Convert an Eastern Arabic numeral string back to a Latin numeral string.
 * Example: "٤٢" -> "42"
 */
export function toLatinNumerals(s: string): string {
  return s
    .split('')
    .map((ch) => {
      const idx = EASTERN_ARABIC_NUMERALS.indexOf(ch as (typeof EASTERN_ARABIC_NUMERALS)[number]);
      return idx >= 0 ? LATIN_DIGITS[idx] : ch;
    })
    .join('');
}

/**
 * Format a score for display in the given locale.
 * Arabic/Darija use Eastern Arabic numerals; others use Latin.
 */
export function formatScore(n: number, locale: string): string {
  if (locale === 'ar' || locale === 'darija') {
    return toArabicNumerals(n);
  }
  return String(n);
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Arabic: "٣ دقائق" / French: "3 minutes" / etc.
 */
export function formatDuration(ms: number, locale: string): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const MINUTE_LABELS: Record<string, string> = {
    ar: '\u062F\u0642\u0627\u0626\u0642', // دقائق
    darija: '\u062F\u0642\u0627\u064A\u0642', // دقايق
    fr: 'minutes',
    en: 'minutes',
    es: 'minutos',
  };

  const SECOND_LABELS: Record<string, string> = {
    ar: '\u062B\u0648\u0627\u0646\u064A', // ثواني
    darija: '\u062B\u0648\u0627\u0646\u064A', // ثواني
    fr: 'secondes',
    en: 'seconds',
    es: 'segundos',
  };

  const AND: Record<string, string> = {
    ar: '\u0648', // و
    darija: '\u0648', // و
    fr: 'et',
    en: 'and',
    es: 'y',
  };

  const fmtNum = (n: number) => formatScore(n, locale);
  const minuteLabel = MINUTE_LABELS[locale] ?? MINUTE_LABELS.en;
  const secondLabel = SECOND_LABELS[locale] ?? SECOND_LABELS.en;
  const and = AND[locale] ?? AND.en;

  if (minutes > 0 && seconds > 0) {
    return `${fmtNum(minutes)} ${minuteLabel} ${and} ${fmtNum(seconds)} ${secondLabel}`;
  }
  if (minutes > 0) {
    return `${fmtNum(minutes)} ${minuteLabel}`;
  }
  return `${fmtNum(seconds)} ${secondLabel}`;
}

// ─── Card value labels (1-13) ────────────────────────────────────────────────

const CARD_NAMES: Record<number, Record<string, string>> = {
  1: {
    ar: '\u0622\u0633', // آس
    fr: 'As',
    darija: '\u0644\u0627\u0635', // لاص
    en: 'Ace',
    es: 'As',
  },
  2: {
    ar: '\u0627\u062B\u0646\u0627\u0646', // اثنان
    fr: 'Deux',
    darija: '\u0632\u0648\u062C', // زوج
    en: 'Two',
    es: 'Dos',
  },
  3: {
    ar: '\u062B\u0644\u0627\u062B\u0629', // ثلاثة
    fr: 'Trois',
    darija: '\u062A\u0644\u0627\u062A\u0629', // تلاتة
    en: 'Three',
    es: 'Tres',
  },
  4: {
    ar: '\u0623\u0631\u0628\u0639\u0629', // أربعة
    fr: 'Quatre',
    darija: '\u0631\u0628\u0639\u0629', // ربعة
    en: 'Four',
    es: 'Cuatro',
  },
  5: {
    ar: '\u062E\u0645\u0633\u0629', // خمسة
    fr: 'Cinq',
    darija: '\u062E\u0645\u0633\u0629', // خمسة
    en: 'Five',
    es: 'Cinco',
  },
  6: {
    ar: '\u0633\u062A\u0629', // ستة
    fr: 'Six',
    darija: '\u0633\u062A\u0629', // ستة
    en: 'Six',
    es: 'Seis',
  },
  7: {
    ar: '\u0633\u0628\u0639\u0629', // سبعة
    fr: 'Sept',
    darija: '\u0633\u0628\u0639\u0629', // سبعة
    en: 'Seven',
    es: 'Siete',
  },
  8: {
    ar: '\u062B\u0645\u0627\u0646\u064A\u0629', // ثمانية
    fr: 'Huit',
    darija: '\u062A\u0645\u0646\u064A\u0629', // تمنية
    en: 'Eight',
    es: 'Ocho',
  },
  9: {
    ar: '\u062A\u0633\u0639\u0629', // تسعة
    fr: 'Neuf',
    darija: '\u062A\u0633\u0639\u0648\u062F', // تسعود
    en: 'Nine',
    es: 'Nueve',
  },
  10: {
    ar: '\u0639\u0634\u0631\u0629', // عشرة — also Sota in Spanish deck
    fr: 'Dix',
    darija: '\u0639\u0634\u0631\u0629', // عشرة
    en: 'Ten',
    es: 'Diez',
  },
  11: {
    ar: '\u0648\u0644\u062F', // ولد — Caballo / Valet
    fr: 'Valet',
    darija: '\u0627\u0644\u0648\u0644\u062F', // الولد
    en: 'Jack',
    es: 'Sota',
  },
  12: {
    ar: '\u0641\u0627\u0631\u0633', // فارس — Caballo
    fr: 'Cavalier',
    darija: '\u0627\u0644\u0641\u0627\u0631\u0633', // الفارس
    en: 'Knight',
    es: 'Caballo',
  },
  13: {
    ar: '\u0645\u0644\u0643', // ملك
    fr: 'Roi',
    darija: '\u0627\u0644\u0631\u064A', // الري
    en: 'King',
    es: 'Rey',
  },
};

// ─── Suit labels ─────────────────────────────────────────────────────────────

const SUIT_NAMES: Record<string, Record<string, string>> = {
  // Spanish deck suits
  oros: {
    ar: '\u0630\u0647\u0628', // ذهب
    fr: 'Or',
    darija: '\u0627\u0644\u0630\u0647\u0628', // الذهب
    en: 'Gold',
    es: 'Oro',
  },
  copas: {
    ar: '\u0643\u0623\u0633', // كأس
    fr: 'Coupe',
    darija: '\u0627\u0644\u0643\u0627\u0633', // الكاس
    en: 'Cup',
    es: 'Copa',
  },
  espadas: {
    ar: '\u0633\u064A\u0641', // سيف
    fr: '\u00C9p\u00E9e',
    darija: '\u0627\u0644\u0633\u064A\u0641', // السيف
    en: 'Sword',
    es: 'Espada',
  },
  bastos: {
    ar: '\u0639\u0635\u0627', // عصا
    fr: 'B\u00E2ton',
    darija: '\u0627\u0644\u0639\u0635\u0627', // العصا
    en: 'Club',
    es: 'Basto',
  },
  // French deck suits
  coeurs: {
    ar: '\u0642\u0644\u0628', // قلب
    fr: 'C\u0153ur',
    darija: '\u0627\u0644\u0643\u0648\u0631', // الكور
    en: 'Heart',
    es: 'Coraz\u00F3n',
  },
  carreaux: {
    ar: '\u062F\u064A\u0646\u0627\u0631\u064A', // ديناري
    fr: 'Carreau',
    darija: '\u0627\u0644\u062F\u064A\u0646\u0627\u0631\u064A', // الديناري
    en: 'Diamond',
    es: 'Diamante',
  },
  piques: {
    ar: '\u0633\u0628\u064A\u062A', // سبيت
    fr: 'Pique',
    darija: '\u0627\u0644\u0633\u0628\u064A\u062A', // السبيت
    en: 'Spade',
    es: 'Pica',
  },
  trefles: {
    ar: '\u062A\u0631\u0641\u0644', // ترفل
    fr: 'Tr\u00E8fle',
    darija: '\u0627\u0644\u062A\u0631\u0641\u0644', // الترفل
    en: 'Club',
    es: 'Tr\u00E9bol',
  },
};

/**
 * Get a localized card value label (e.g., "Ace" in English, "آس" in Arabic).
 */
export function cardValueLabel(value: number, locale: string): string {
  const names = CARD_NAMES[value];
  if (!names) return formatScore(value, locale);
  return names[locale] ?? names.en ?? String(value);
}

/**
 * Get a localized suit label (e.g., "Gold" in English, "ذهب" in Arabic).
 */
export function suitLabel(suit: string, locale: string): string {
  const names = SUIT_NAMES[suit];
  if (!names) return suit;
  return names[locale] ?? names.en ?? suit;
}

export { CARD_NAMES, SUIT_NAMES };
