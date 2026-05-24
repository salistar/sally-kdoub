export type SpanishSuit = 'oros' | 'copas' | 'espadas' | 'bastos';

export type FrenchSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Suit = SpanishSuit | FrenchSuit;

export type DeckType =
  | 'spanish40'
  | 'french52'
  | 'french32'
  | 'tarot78'
  | 'okey106';

export interface Card {
  id: string;
  suit: Suit;
  value: number;
  deck: DeckType;
}
