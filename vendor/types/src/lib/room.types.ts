import { GameType, GameMode, GameStatus, Player } from './game.types';

export interface RoomConfig {
  maxPlayers: number;
  timerSeconds: number;
  gameType: GameType;
  mode: GameMode;
  isPrivate: boolean;
  password?: string;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  gameType: GameType;
  players: Player[];
  status: GameStatus;
  config: RoomConfig;
  createdAt: string;
}
