export enum GameType {
  RONDA = 'RONDA',
  KDOUB = 'KDOUB',
  BELOTE = 'BELOTE',
  POKER = 'POKER',
  TAROT = 'TAROT',
  SCOPA = 'SCOPA',
  OKEY = 'OKEY',
  CONCENTRATION = 'CONCENTRATION',
  SOLITAIRE = 'SOLITAIRE',
  QUIESTCE = 'QUIESTCE',
}

export enum GameStatus {
  WAITING = 'WAITING',
  STARTING = 'STARTING',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
  ABANDONED = 'ABANDONED',
}

export enum GameMode {
  ONLINE = 'ONLINE',
  BLUETOOTH = 'BLUETOOTH',
  LAN = 'LAN',
  OFFLINE = 'OFFLINE',
  AI_ONLY = 'AI_ONLY',
}

export enum ConnectionMode {
  SOCKET = 'SOCKET',
  WEBRTC = 'WEBRTC',
  BLE = 'BLE',
  LAN = 'LAN',
  LOCAL = 'LOCAL',
}

export interface Player {
  id: string;
  username: string;
  avatar: string;
  score: number;
  isBot: boolean;
  isConnected: boolean;
  isReady: boolean;
}

export interface GameState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string | null;
  turnNumber: number;
  phase: string;
  createdAt: string;
}

export interface Move {
  playerId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
