import { Card, GameType, GameStatus, Player } from '@sally/types';

export interface PokerPlayer extends Player {
  chips: number;
}

export interface PokerPlayerState {
  chips: number;
  totalBet: number;
  folded: boolean;
  allIn: boolean;
}

export interface SidePot {
  amount: number;
  eligiblePlayers: string[];
}

export interface PokerState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: PokerPlayer[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
  createdAt: number;

  communityCards: Card[];
  hands: Record<string, Card[]>;
  deck: Card[];
  pot: number;
  sidePots: SidePot[];
  currentBet: number;
  bets: Record<string, number>;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  playerStates: Record<string, PokerPlayerState>;
  lastRaiser: string | null;
  minRaise: number;
  actionCount: number;
}

export type PokerMove =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }
  | { type: 'allIn' };

export interface PokerConfig {
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
  seed?: number;
}

/** Hand ranking categories from highest to lowest */
export enum HandRank {
  ROYAL_FLUSH = 9,
  STRAIGHT_FLUSH = 8,
  FOUR_OF_A_KIND = 7,
  FULL_HOUSE = 6,
  FLUSH = 5,
  STRAIGHT = 4,
  THREE_OF_A_KIND = 3,
  TWO_PAIR = 2,
  ONE_PAIR = 1,
  HIGH_CARD = 0,
}

export interface HandEvaluation {
  rank: HandRank;
  /** Kickers for tiebreaking, ordered highest to lowest */
  kickers: number[];
  /** Human-readable description */
  description: string;
}
