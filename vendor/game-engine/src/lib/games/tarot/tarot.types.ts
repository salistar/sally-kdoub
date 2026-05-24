import { Card, GameType, GameStatus, Player } from '@sally/types';

export interface TarotTrickEntry {
  playerId: string;
  card: Card;
}

export interface TarotTrick {
  cards: TarotTrickEntry[];
  winnerId: string;
}

export type TarotContract = 'petite' | 'garde' | 'garde_sans' | 'garde_contre';

export interface TarotState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'dealing' | 'bidding' | 'dog' | 'playing' | 'scoring' | 'ended';
  createdAt: number;

  hands: Record<string, Card[]>;
  dog: Card[];
  tricks: TarotTrick[];
  currentTrick: TarotTrickEntry[];
  taker: string | null;
  contract: TarotContract | null;
  takerWonCards: Card[];
  defenseWonCards: Card[];
  excuseOwner: string | null;
  excusePlayedBy: string | null;
}

export type TarotMove =
  | { type: 'bid'; contract: TarotContract }
  | { type: 'pass' }
  | { type: 'discard'; cardIds: string[] }
  | { type: 'playCard'; cardId: string };

export interface TarotConfig {
  seed?: number;
}
