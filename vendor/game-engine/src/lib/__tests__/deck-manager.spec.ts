import { Card } from '@sally/types';
import { DeckManager } from '../deck-manager';

describe('DeckManager', () => {
  let dm: DeckManager;

  beforeEach(() => {
    dm = new DeckManager();
  });

  // --- Deck creation ---

  it('should create a spanish40 deck with exactly 40 cards', () => {
    const deck = dm.createDeck('spanish40');
    expect(deck.length).toBe(40);
  });

  it('should create a spanish40 deck with correct suits', () => {
    const deck = dm.createDeck('spanish40');
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['oros', 'copas', 'espadas', 'bastos']));
  });

  it('should create a spanish40 deck without values 8 and 9', () => {
    const deck = dm.createDeck('spanish40');
    const values = new Set(deck.map((c) => c.value));
    expect(values.has(8)).toBe(false);
    expect(values.has(9)).toBe(false);
  });

  it('should create a french52 deck with exactly 52 cards', () => {
    const deck = dm.createDeck('french52');
    expect(deck.length).toBe(52);
  });

  it('should create a french52 deck with values 1-13 in all 4 suits', () => {
    const deck = dm.createDeck('french52');
    const suits = new Set(deck.map((c) => c.suit));
    expect(suits).toEqual(new Set(['hearts', 'diamonds', 'clubs', 'spades']));

    for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
      const suitCards = deck.filter((c) => c.suit === suit);
      expect(suitCards.length).toBe(13);
      const values = suitCards.map((c) => c.value).sort((a, b) => a - b);
      expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    }
  });

  it('should create a french32 deck with exactly 32 cards', () => {
    const deck = dm.createDeck('french32');
    expect(deck.length).toBe(32);
  });

  it('should create a tarot78 deck with exactly 78 cards', () => {
    const deck = dm.createDeck('tarot78');
    expect(deck.length).toBe(78);
  });

  it('should throw for unsupported deck type', () => {
    expect(() => dm.createDeck('unknown' as any)).toThrow('Unsupported deck type');
  });

  // --- Shuffle ---

  it('should shuffle and change the order of cards', () => {
    const deck = dm.createDeck('french52');
    const shuffled = dm.shuffle(deck);
    // Extremely unlikely to be in the same order
    const sameOrder = deck.every((c, i) => c.id === shuffled[i].id);
    expect(sameOrder).toBe(false);
    // Same number of cards
    expect(shuffled.length).toBe(deck.length);
  });

  it('should produce the same result with the same seed', () => {
    const deck = dm.createDeck('french52');
    const shuffled1 = dm.shuffle(deck, 42);
    const shuffled2 = dm.shuffle(deck, 42);
    expect(shuffled1.map((c) => c.id)).toEqual(shuffled2.map((c) => c.id));
  });

  it('should produce different results with different seeds', () => {
    const deck = dm.createDeck('french52');
    const shuffled1 = dm.shuffle(deck, 42);
    const shuffled2 = dm.shuffle(deck, 99);
    const sameOrder = shuffled1.every((c, i) => c.id === shuffled2[i].id);
    expect(sameOrder).toBe(false);
  });

  it('should not mutate the original deck', () => {
    const deck = dm.createDeck('french52');
    const originalIds = deck.map((c) => c.id);
    dm.shuffle(deck, 42);
    expect(deck.map((c) => c.id)).toEqual(originalIds);
  });

  // --- Deal ---

  it('should deal correct number of cards to each player', () => {
    const deck = dm.createDeck('french52');
    const { hands, remaining } = dm.deal(deck, 4, 5);
    expect(hands.length).toBe(4);
    for (const hand of hands) {
      expect(hand.length).toBe(5);
    }
    expect(remaining.length).toBe(52 - 20);
  });

  it('should throw when not enough cards to deal', () => {
    const deck = dm.createDeck('spanish40');
    expect(() => dm.deal(deck, 10, 5)).toThrow('Not enough cards');
  });

  it('should deal cards in round-robin fashion', () => {
    const deck = dm.createDeck('french52');
    const { hands } = dm.deal(deck, 2, 3);
    // Player 0 gets cards at index 0, 2, 4
    // Player 1 gets cards at index 1, 3, 5
    expect(hands[0][0].id).toBe(deck[0].id);
    expect(hands[1][0].id).toBe(deck[1].id);
    expect(hands[0][1].id).toBe(deck[2].id);
    expect(hands[1][1].id).toBe(deck[3].id);
  });

  // --- Draw ---

  it('should draw a single card from the top', () => {
    const deck = dm.createDeck('french52');
    const { card, remaining } = dm.drawCard(deck);
    expect(card.id).toBe(deck[0].id);
    expect(remaining.length).toBe(51);
  });

  it('should throw when drawing from empty deck', () => {
    expect(() => dm.drawCard([])).toThrow('Cannot draw from an empty deck');
  });

  // --- Cut ---

  it('should cut the deck at the midpoint', () => {
    const deck = dm.createDeck('french52');
    const cut = dm.cut(deck);
    expect(cut.length).toBe(52);
    // The first card should now be from the middle of the original
    expect(cut[0].id).toBe(deck[26].id);
  });

  it('should handle cutting a single-card deck', () => {
    const singleCard: Card[] = [
      { id: 'test', suit: 'hearts', value: 1, deck: 'french52' },
    ];
    const result = dm.cut(singleCard);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('test');
  });

  // --- All cards have unique IDs ---

  it('should create cards with unique IDs', () => {
    const deck = dm.createDeck('french52');
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);
  });
});
