import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';

export type AnnouncementType = 'ronda' | 'tringa' | 'missa';

export interface Announcement {
  playerId: string;
  type: AnnouncementType;
  cards: Card[];
  points: number;
}

export interface RondaState {
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
  announcements: Announcement[];
  lastCapture: string | null;
  roundNumber: number;
  targetScore: number;
}

export type RondaMove =
  | { type: 'playCard'; cardId: string }
  | { type: 'captureWithCard'; cardId: string; capturedIds: string[] }
  | { type: 'announceRonda'; cards: [string, string] }
  | { type: 'announceTringa'; cards: [string, string, string] };

export interface RondaConfig {
  targetScore: 21 | 41;
  enableAnnouncements: boolean;
  playerCount: 2 | 3 | 4;
}
