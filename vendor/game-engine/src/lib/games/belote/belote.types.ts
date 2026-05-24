import { Card, GameType, GameStatus, Player } from '@sally/types';

export interface TrickEntry {
  playerId: string;
  card: Card;
}

export interface Trick {
  cards: TrickEntry[];
  winnerId: string;
}

export interface BeloteContract {
  team: number;
  value: number;
  trumpSuit: string;
  coinched: boolean;
  surcoinched: boolean;
}

export interface BiddingEntry {
  playerId: string;
  bid: number | 'pass' | 'coinche' | 'surcoinche';
  trumpSuit?: string;
}

export interface BeloteState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'dealing' | 'bidding' | 'playing' | 'scoring' | 'ended';
  createdAt: number;

  hands: Record<string, Card[]>;
  tricks: Trick[];
  currentTrick: TrickEntry[];
  trumpSuit: string | null;
  contract: BeloteContract | null;
  teams: [string[], string[]];
  teamScores: [number, number];
  roundScores: [number, number];
  dealerId: string;
  biddingHistory: BiddingEntry[];
  beloteRebelote: { playerId: string; declared: boolean } | null;
}

export type BeloteMove =
  | { type: 'bid'; value: number; trumpSuit: string }
  | { type: 'pass' }
  | { type: 'coinche' }
  | { type: 'surcoinche' }
  | { type: 'playCard'; cardId: string }
  | { type: 'declareBelote' };

export interface BeloteConfig {
  seed?: number;
  targetScore?: number;
}
