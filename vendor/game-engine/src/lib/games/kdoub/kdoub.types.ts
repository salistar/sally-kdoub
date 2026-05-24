import { Card, GameType, GameStatus, Player } from '@sally/types';

export interface KdoubClaim {
  playerId: string;
  claimedValue: number;
  cardCount: number;
}

export interface KdoubState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'playing' | 'ended';
  createdAt: number;

  hands: Record<string, Card[]>;
  pile: Card[];
  lastClaim: KdoubClaim | null;
  currentDeclaredValue: number;
  mode: 'free' | 'sequential';
}

export type KdoubMove =
  | { type: 'playCards'; cardIds: string[]; claimedValue: number }
  | { type: 'callBluff' };

export interface KdoubConfig {
  mode: 'free' | 'sequential';
  seed?: number;
}
