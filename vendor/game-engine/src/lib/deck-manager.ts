import { Card, DeckType, SpanishSuit, FrenchSuit } from '@sally/types';

/**
 * Mulberry32 seeded PRNG - produces deterministic pseudo-random numbers from a seed.
 * Returns a function that yields numbers in [0, 1) on each call.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPANISH_SUITS: SpanishSuit[] = ['oros', 'copas', 'espadas', 'bastos'];
const FRENCH_SUITS: FrenchSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

export class DeckManager {
  /**
   * Creates a new deck of the given type with cards in standard order.
   */
  createDeck(type: DeckType): Card[] {
    switch (type) {
      case 'spanish40':
        return this.createSpanish40();
      case 'french52':
        return this.createFrench52();
      case 'french32':
        return this.createFrench32();
      case 'tarot78':
        return this.createTarot78();
      default:
        throw new Error(`Unsupported deck type: ${type}`);
    }
  }

  /**
   * Shuffles a deck using Fisher-Yates algorithm.
   * Optionally accepts a seed for reproducible shuffles.
   */
  shuffle(deck: Card[], seed?: number): Card[] {
    const shuffled = [...deck];
    const rng = seed !== undefined ? mulberry32(seed) : Math.random;

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Deals cards from the top of the deck to the specified number of players.
   * Cards are dealt one at a time in round-robin fashion.
   */
  deal(
    deck: Card[],
    numPlayers: number,
    cardsPerPlayer: number
  ): { hands: Card[][]; remaining: Card[] } {
    const totalNeeded = numPlayers * cardsPerPlayer;
    if (totalNeeded > deck.length) {
      throw new Error(
        `Not enough cards: need ${totalNeeded} but deck has ${deck.length}`
      );
    }

    const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
    const remaining = [...deck];

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (let player = 0; player < numPlayers; player++) {
        hands[player].push(remaining.shift()!);
      }
    }

    return { hands, remaining };
  }

  /**
   * Draws a single card from the top of the deck.
   */
  drawCard(deck: Card[]): { card: Card; remaining: Card[] } {
    if (deck.length === 0) {
      throw new Error('Cannot draw from an empty deck');
    }

    const remaining = [...deck];
    const card = remaining.shift()!;
    return { card, remaining };
  }

  /**
   * Cuts the deck at a random midpoint (or approximately the middle).
   * The bottom half is placed on top.
   */
  cut(deck: Card[]): Card[] {
    if (deck.length <= 1) return [...deck];

    const mid = Math.floor(deck.length / 2);
    return [...deck.slice(mid), ...deck.slice(0, mid)];
  }

  // --- Private deck creation helpers ---

  private createSpanish40(): Card[] {
    const cards: Card[] = [];
    // Spanish 40-card deck: values 1-7, 10-12 (no 8, 9)
    const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

    for (const suit of SPANISH_SUITS) {
      for (const value of values) {
        cards.push({
          id: `spanish40-${suit}-${value}`,
          suit,
          value,
          deck: 'spanish40',
        });
      }
    }

    return cards;
  }

  private createFrench52(): Card[] {
    const cards: Card[] = [];

    for (const suit of FRENCH_SUITS) {
      for (let value = 1; value <= 13; value++) {
        cards.push({
          id: `french52-${suit}-${value}`,
          suit,
          value,
          deck: 'french52',
        });
      }
    }

    return cards;
  }

  private createFrench32(): Card[] {
    const cards: Card[] = [];
    // French 32-card deck (piquet): values 1 (ace), 7-13
    const values = [1, 7, 8, 9, 10, 11, 12, 13];

    for (const suit of FRENCH_SUITS) {
      for (const value of values) {
        cards.push({
          id: `french32-${suit}-${value}`,
          suit,
          value,
          deck: 'french32',
        });
      }
    }

    return cards;
  }

  private createTarot78(): Card[] {
    const cards: Card[] = [];

    // 56 suited cards: values 1-14 in each French suit (includes knight at 12)
    for (const suit of FRENCH_SUITS) {
      for (let value = 1; value <= 14; value++) {
        cards.push({
          id: `tarot78-${suit}-${value}`,
          suit,
          value,
          deck: 'tarot78',
        });
      }
    }

    // 22 trump cards (Major Arcana): value 0-21, using 'spades' as a placeholder suit
    for (let value = 0; value <= 21; value++) {
      cards.push({
        id: `tarot78-trump-${value}`,
        suit: 'spades',
        value,
        deck: 'tarot78',
      });
    }

    return cards;
  }
}
