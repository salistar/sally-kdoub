import { GameType, GameStatus, Player } from '@sally/types';

export interface OkeyTile {
  id: string;
  color: 'red' | 'blue' | 'green' | 'black';
  value: number; // 1-13
  isJoker: boolean;
}

export interface OkeyState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'playing' | 'ended';
  createdAt: number;

  tiles: OkeyTile[];
  hands: Record<string, OkeyTile[]>;
  drawPile: OkeyTile[];
  discardPiles: Record<string, OkeyTile[]>;
  okeyTile: OkeyTile;
  hasDrawn: boolean;
  winner: string | null;
}

export type OkeyMove =
  | { type: 'drawFromPile' }
  | { type: 'drawFromDiscard'; fromPlayerId: string }
  | { type: 'discard'; tileId: string }
  | { type: 'declare'; groups: string[][] };

export interface OkeyConfig {
  playerCount: 2 | 3 | 4;
}
