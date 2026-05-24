import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';

export interface ScopaState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'dealing' | 'playing' | 'scoring' | 'ended';
  createdAt: number;

  deck: Card[];
  table: Card[];
  hands: Record<string, Card[]>;
  captured: Record<string, Card[]>;
  scores: Record<string, number>;
  roundScores: Record<string, number>;
  scopas: Record<string, number>;
  lastCapture: string | null;
  roundNumber: number;
  targetScore: number;
}

export type ScopaMove =
  | { type: 'playCard'; cardId: string }
  | { type: 'captureWithCard'; cardId: string; capturedIds: string[] };

export interface ScopaConfig {
  targetScore: 11 | 21;
  playerCount: 2 | 3 | 4;
}
