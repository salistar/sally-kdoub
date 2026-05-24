import { QuestionType } from './quiestce.types';

export const QUESTIONS: Record<QuestionType, Record<string, string>> = {
  isFigure: {
    en: 'Is it a face card?',
    fr: 'Est-ce une figure ?',
    ar: '\u0647\u0644 \u0647\u064A \u0635\u0648\u0631\u0629\u061F',
    es: '\u00BFEs una figura?',
    de: 'Ist es eine Bildkarte?',
  },
  isSuit: {
    en: 'Is it {suit}?',
    fr: 'Est-ce du {suit} ?',
    ar: '\u0647\u0644 \u0647\u064A \u0645\u0646 {suit}\u061F',
    es: '\u00BFEs de {suit}?',
    de: 'Ist es {suit}?',
  },
  isValueGreaterThan: {
    en: 'Is the value greater than {value}?',
    fr: 'La valeur est-elle sup\u00E9rieure \u00E0 {value} ?',
    ar: '\u0647\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 {value}\u061F',
    es: '\u00BFEl valor es mayor que {value}?',
    de: 'Ist der Wert gr\u00F6\u00DFer als {value}?',
  },
  isValueLessThan: {
    en: 'Is the value less than {value}?',
    fr: 'La valeur est-elle inf\u00E9rieure \u00E0 {value} ?',
    ar: '\u0647\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0623\u0635\u063A\u0631 \u0645\u0646 {value}\u061F',
    es: '\u00BFEl valor es menor que {value}?',
    de: 'Ist der Wert kleiner als {value}?',
  },
  isExactValue: {
    en: 'Is the value exactly {value}?',
    fr: 'La valeur est-elle exactement {value} ?',
    ar: '\u0647\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0628\u0627\u0644\u0636\u0628\u0637 {value}\u061F',
    es: '\u00BFEl valor es exactamente {value}?',
    de: 'Ist der Wert genau {value}?',
  },
  isOdd: {
    en: 'Is the value odd?',
    fr: 'La valeur est-elle impaire ?',
    ar: '\u0647\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0641\u0631\u062F\u064A\u0629\u061F',
    es: '\u00BFEl valor es impar?',
    de: 'Ist der Wert ungerade?',
  },
  isEven: {
    en: 'Is the value even?',
    fr: 'La valeur est-elle paire ?',
    ar: '\u0647\u0644 \u0627\u0644\u0642\u064A\u0645\u0629 \u0632\u0648\u062C\u064A\u0629\u061F',
    es: '\u00BFEl valor es par?',
    de: 'Ist der Wert gerade?',
  },
  isAce: {
    en: 'Is it an ace?',
    fr: 'Est-ce un as ?',
    ar: '\u0647\u0644 \u0647\u064A \u0622\u0633\u061F',
    es: '\u00BFEs un as?',
    de: 'Ist es ein Ass?',
  },
};

const SUIT_NAMES: Record<string, Record<string, string>> = {
  oros: {
    en: 'coins',
    fr: 'deniers',
    ar: '\u0630\u0647\u0628',
    es: 'oros',
    de: 'M\u00FCnzen',
  },
  copas: {
    en: 'cups',
    fr: 'coupes',
    ar: '\u0643\u0624\u0648\u0633',
    es: 'copas',
    de: 'Kelche',
  },
  espadas: {
    en: 'swords',
    fr: '\u00E9p\u00E9es',
    ar: '\u0633\u064A\u0648\u0641',
    es: 'espadas',
    de: 'Schwerter',
  },
  bastos: {
    en: 'clubs',
    fr: 'b\u00E2tons',
    ar: '\u0647\u0631\u0627\u0648\u0627\u062A',
    es: 'bastos',
    de: 'St\u00E4be',
  },
};

/**
 * Formats a question string by replacing placeholders with actual values.
 */
export function formatQuestion(
  questionType: QuestionType,
  lang: string,
  value?: unknown
): string {
  const template = QUESTIONS[questionType]?.[lang] ?? QUESTIONS[questionType]?.['en'] ?? '';

  if (questionType === 'isSuit' && typeof value === 'string') {
    const suitName = SUIT_NAMES[value]?.[lang] ?? SUIT_NAMES[value]?.['en'] ?? value;
    return template.replace('{suit}', suitName);
  }

  if (value !== undefined) {
    return template.replace('{value}', String(value));
  }

  return template;
}

/**
 * Evaluates whether a question is true for a given card.
 */
export function evaluateQuestion(
  questionType: QuestionType,
  card: { suit: string; value: number },
  questionValue?: unknown
): boolean {
  switch (questionType) {
    case 'isFigure':
      // In Spanish 40-card deck, face cards are 10 (sota), 11 (caballo), 12 (rey)
      return card.value >= 10;
    case 'isSuit':
      return card.suit === questionValue;
    case 'isValueGreaterThan':
      return card.value > (questionValue as number);
    case 'isValueLessThan':
      return card.value < (questionValue as number);
    case 'isExactValue':
      return card.value === (questionValue as number);
    case 'isOdd':
      return card.value % 2 !== 0;
    case 'isEven':
      return card.value % 2 === 0;
    case 'isAce':
      return card.value === 1;
    default:
      return false;
  }
}
