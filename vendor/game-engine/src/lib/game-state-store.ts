// ---------------------------------------------------------------------------
// Game State Store – Zustand store factory for any SallyCards game type
// ---------------------------------------------------------------------------
// Each game screen creates its own store via `createGameStore<RondaState>()`.
// The store holds the authoritative client-side state and exposes helpers for
// optimistic updates, rollbacks, and lifecycle management.
// ---------------------------------------------------------------------------

import { create, StoreApi, UseBoundStore } from 'zustand';

// ---- Types -----------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  avatar?: string;
  isBot?: boolean;
}

export type GamePhase =
  | 'waiting'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'ended';

export type ConnectionMode = 'online' | 'local' | 'bot';

export interface GameStoreState<TState> {
  /** The full game-specific state object (e.g. RondaState). */
  state: TState | null;
  /** Players in the current game. */
  players: Player[];
  /** Whether it is the local player's turn. */
  isMyTurn: boolean;
  /** How the game is connected. */
  connectionMode: ConnectionMode;
  /** Current lifecycle phase. */
  phase: GamePhase;
  /** ID of the local player. */
  localPlayerId: string | null;
  /** History stack for undo / rollback (most recent first). */
  history: TState[];
  /** Maximum history depth (default 10). */
  maxHistory: number;

  // -- Actions ---------------------------------------------------------------

  /** Replace the entire game state (e.g. from server sync). */
  setGameState: (state: TState) => void;
  /** Apply an optimistic move locally.  Pushes previous state to history. */
  processMove: (updater: (current: TState) => TState) => void;
  /** Roll back to a previous state (e.g. server rejected the move). */
  rollbackMove: (previousState: TState) => void;
  /** Set player list. */
  setPlayers: (players: Player[]) => void;
  /** Update whose turn it is. */
  setIsMyTurn: (isMyTurn: boolean) => void;
  /** Transition to a new phase. */
  setPhase: (phase: GamePhase) => void;
  /** Set connection mode. */
  setConnectionMode: (mode: ConnectionMode) => void;
  /** Set local player ID. */
  setLocalPlayerId: (id: string) => void;
  /** Mark the game as ended. */
  endGame: () => void;
  /** Full reset back to initial empty state. */
  reset: () => void;
}

// ---- Factory ---------------------------------------------------------------

/**
 * Create a typed Zustand store for a specific game.
 *
 * ```ts
 * const useRondaStore = createGameStore<RondaState>();
 *
 * function RondaScreen() {
 *   const { state, processMove } = useRondaStore();
 *   // ...
 * }
 * ```
 */
export function createGameStore<TState>(): UseBoundStore<StoreApi<GameStoreState<TState>>> {
  return create<GameStoreState<TState>>((set, get) => ({
    state: null,
    players: [],
    isMyTurn: false,
    connectionMode: 'online',
    phase: 'waiting',
    localPlayerId: null,
    history: [],
    maxHistory: 10,

    // -- Actions -------------------------------------------------------------

    setGameState: (state) => set({ state }),

    processMove: (updater) => {
      const current = get().state;
      if (!current) return;

      const history = [current, ...get().history].slice(0, get().maxHistory);
      const next = updater(current);
      set({ state: next, history });
    },

    rollbackMove: (previousState) => {
      set({ state: previousState });
    },

    setPlayers: (players) => set({ players }),

    setIsMyTurn: (isMyTurn) => set({ isMyTurn }),

    setPhase: (phase) => set({ phase }),

    setConnectionMode: (mode) => set({ connectionMode: mode }),

    setLocalPlayerId: (id) => set({ localPlayerId: id }),

    endGame: () => set({ phase: 'ended' }),

    reset: () =>
      set({
        state: null,
        players: [],
        isMyTurn: false,
        phase: 'waiting',
        localPlayerId: null,
        history: [],
      }),
  }));
}
