import { CARD_NAMES, SUIT_NAMES, cardValueLabel, suitLabel, formatScore } from './arabicUtils';

// ─── Spanish deck values (1-12, skipping 8 and 9 in traditional decks) ──────

const SPANISH_VALUES: Record<number, Record<string, string>> = {
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
  10: {
    ar: '\u0635\u0648\u0637\u0627', // صوطا — Sota
    fr: 'Valet',
    darija: '\u0627\u0644\u0635\u0648\u0637\u0627', // الصوطا
    en: 'Page',
    es: 'Sota',
  },
  11: {
    ar: '\u0641\u0627\u0631\u0633', // فارس — Caballo
    fr: 'Cavalier',
    darija: '\u0627\u0644\u0641\u0627\u0631\u0633', // الفارس
    en: 'Knight',
    es: 'Caballo',
  },
  12: {
    ar: '\u0645\u0644\u0643', // ملك — Rey
    fr: 'Roi',
    darija: '\u0627\u0644\u0631\u064A', // الري
    en: 'King',
    es: 'Rey',
  },
};

const SPANISH_SUITS: Record<string, Record<string, string>> = {
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
};

// ─── French deck values (1-13) ──────────────────────────────────────────────

const FRENCH_VALUES: Record<number, Record<string, string>> = {
  1: {
    ar: '\u0622\u0633', // آس
    fr: 'As',
    darija: '\u0644\u0627\u0635', // لاص
    en: 'Ace',
    es: 'As',
  },
  2: {
    ar: '\u0627\u062B\u0646\u0627\u0646',
    fr: 'Deux',
    darija: '\u0632\u0648\u062C',
    en: 'Two',
    es: 'Dos',
  },
  3: {
    ar: '\u062B\u0644\u0627\u062B\u0629',
    fr: 'Trois',
    darija: '\u062A\u0644\u0627\u062A\u0629',
    en: 'Three',
    es: 'Tres',
  },
  4: {
    ar: '\u0623\u0631\u0628\u0639\u0629',
    fr: 'Quatre',
    darija: '\u0631\u0628\u0639\u0629',
    en: 'Four',
    es: 'Cuatro',
  },
  5: {
    ar: '\u062E\u0645\u0633\u0629',
    fr: 'Cinq',
    darija: '\u062E\u0645\u0633\u0629',
    en: 'Five',
    es: 'Cinco',
  },
  6: {
    ar: '\u0633\u062A\u0629',
    fr: 'Six',
    darija: '\u0633\u062A\u0629',
    en: 'Six',
    es: 'Seis',
  },
  7: {
    ar: '\u0633\u0628\u0639\u0629',
    fr: 'Sept',
    darija: '\u0633\u0628\u0639\u0629',
    en: 'Seven',
    es: 'Siete',
  },
  8: {
    ar: '\u062B\u0645\u0627\u0646\u064A\u0629',
    fr: 'Huit',
    darija: '\u062A\u0645\u0646\u064A\u0629',
    en: 'Eight',
    es: 'Ocho',
  },
  9: {
    ar: '\u062A\u0633\u0639\u0629',
    fr: 'Neuf',
    darija: '\u062A\u0633\u0639\u0648\u062F',
    en: 'Nine',
    es: 'Nueve',
  },
  10: {
    ar: '\u0639\u0634\u0631\u0629',
    fr: 'Dix',
    darija: '\u0639\u0634\u0631\u0629',
    en: 'Ten',
    es: 'Diez',
  },
  11: {
    ar: '\u0648\u0644\u062F', // ولد — Valet/Jack
    fr: 'Valet',
    darija: '\u0627\u0644\u0648\u0644\u062F', // الولد
    en: 'Jack',
    es: 'Jota',
  },
  12: {
    ar: '\u0628\u0646\u062A', // بنت — Dame/Queen
    fr: 'Dame',
    darija: '\u0627\u0644\u0628\u0646\u062A', // البنت
    en: 'Queen',
    es: 'Reina',
  },
  13: {
    ar: '\u0645\u0644\u0643', // ملك — Roi/King
    fr: 'Roi',
    darija: '\u0627\u0644\u0631\u064A', // الري
    en: 'King',
    es: 'Rey',
  },
};

const FRENCH_SUITS: Record<string, Record<string, string>> = {
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

export type DeckType = 'spanish' | 'french';

/**
 * Get a localized card name, e.g., "Ace of Gold" or "آس ذهب".
 *
 * @param suit  The suit key (e.g., 'oros', 'coeurs')
 * @param value The card value (1-12 for Spanish, 1-13 for French)
 * @param locale The target locale
 * @param deckType Optional deck type override; auto-detected from suit if omitted
 */
export function getCardName(
  suit: string,
  value: number,
  locale: string,
  deckType?: DeckType
): string {
  const deck = deckType ?? detectDeckType(suit);
  const values = deck === 'spanish' ? SPANISH_VALUES : FRENCH_VALUES;
  const suits = deck === 'spanish' ? SPANISH_SUITS : FRENCH_SUITS;

  const valueName = values[value]?.[locale] ?? values[value]?.en ?? String(value);
  const suitName = suits[suit]?.[locale] ?? suits[suit]?.en ?? suit;

  // Arabic/Darija: "آس ذهب" (value suit)
  // French: "As d'Or"
  // English: "Ace of Gold"
  // Spanish: "As de Oro"
  if (locale === 'ar' || locale === 'darija') {
    return `${valueName} ${suitName}`;
  }
  if (locale === 'fr') {
    // Use "de" for suits starting with consonant, "d'" for vowels
    const startsWithVowel = /^[aeiouAEIOUéÉ]/.test(suitName);
    return startsWithVowel ? `${valueName} d'${suitName}` : `${valueName} de ${suitName}`;
  }
  if (locale === 'es') {
    return `${valueName} de ${suitName}`;
  }
  // English
  return `${valueName} of ${suitName}`;
}

/**
 * Get an accessibility label for a card, suitable for screen readers.
 * Includes the score value in the locale's numeral system.
 */
export function getCardAccessibilityLabel(
  suit: string,
  value: number,
  locale: string,
  deckType?: DeckType
): string {
  const cardName = getCardName(suit, value, locale, deckType);
  const scoreValue = formatScore(value, locale);

  const VALUE_LABEL: Record<string, string> = {
    ar: '\u0642\u064A\u0645\u0629', // قيمة
    darija: '\u0642\u064A\u0645\u0629', // قيمة
    fr: 'valeur',
    en: 'value',
    es: 'valor',
  };

  const label = VALUE_LABEL[locale] ?? VALUE_LABEL.en;
  return `${cardName}, ${label} ${scoreValue}`;
}

function detectDeckType(suit: string): DeckType {
  if (suit in SPANISH_SUITS) return 'spanish';
  return 'french';
}

export { SPANISH_VALUES, SPANISH_SUITS, FRENCH_VALUES, FRENCH_SUITS };
