import { GameState, GameType, Move, Player } from './game.types';
import { Room, RoomConfig } from './room.types';

// ── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

// ── Presence ────────────────────────────────────────────────────────────────

export interface PresenceInfo {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
}

// ── Server → Client events ─────────────────────────────────────────────────

export interface ServerToClientEvents {
  // Game events - emitted by game server when game state changes
  'game:state': (state: GameState) => void;      // Full state update
  'game:started': (state: GameState) => void;    // Game has started
  'game:action': (move: Move) => void;           // Another player made a move
  'game:ended': (payload: { winnerId: string | null; finalState: GameState }) => void; // Game finished
  'game:error': (payload: { message: string }) => void; // Game error occurred

  // Room events - emitted when room state changes
  'room:created': (room: Room) => void;          // Room was created
  'room:joined': (payload: { room: Room; player: Player }) => void; // Player joined room
  'room:left': (payload: { roomId: string; playerId: string }) => void; // Player left room
  'room:list': (rooms: Room[]) => void;          // List of available rooms
  'room:updated': (room: Room) => void;          // Room config changed
  'room:error': (payload: { message: string }) => void; // Room error

  // Chat events - real-time messaging
  'chat:message': (message: ChatMessage) => void; // New message received
  'chat:typing': (payload: { userId: string; username: string; isTyping: boolean }) => void; // Typing indicator

  // Presence events - user activity tracking
  'presence:update': (info: PresenceInfo) => void; // User status changed
  'presence:list': (users: PresenceInfo[]) => void; // List of online users
}

// ── Client → Server events ─────────────────────────────────────────────────

export interface ClientToServerEvents {
  // Game events
  'game:start': (payload: { roomId: string }) => void;
  'game:action': (move: Move) => void;
  'game:end': (payload: { roomId: string }) => void;

  // Room events
  'room:create': (
    payload: { gameType: GameType; config: RoomConfig },
    callback: (room: Room) => void,
  ) => void;
  'room:join': (
    payload: { code: string; password?: string },
    callback: (room: Room | null) => void,
  ) => void;
  'room:leave': (payload: { roomId: string }) => void;
  'room:list': (callback: (rooms: Room[]) => void) => void;

  // Chat events
  'chat:message': (payload: { roomId: string; content: string }) => void;
  'chat:typing': (payload: { roomId: string; isTyping: boolean }) => void;

  // Presence events
  'presence:heartbeat': () => void;
}
