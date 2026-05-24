import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';

export interface BoardCell {
  card: Card;
  isRevealed: boolean;
  isMatched: boolean;
}

export interface ConcentrationState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'playing' | 'ended';
  createdAt: number;

  board: BoardCell[];
  firstPick: number | null; // index of first revealed card
  secondPick: number | null; // index of second revealed card
  matchedPairs: Record<string, number>; // playerId -> count
  gridSize: { rows: number; cols: number };
  totalPairs: number;
}

export type ConcentrationMove = { type: 'reveal'; index: number };

export interface ConcentrationConfig {
  gridSize?: { rows: number; cols: number };
  seed?: number;
}
