import { GameType, Player } from '@sally/types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface GameEvent {
  type: string;
  playerId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
  gameId?: string;
}

export abstract class GameEngine<TState, TMove, TConfig> {
  abstract readonly gameType: GameType;
  abstract readonly minPlayers: number;
  abstract readonly maxPlayers: number;

  abstract initialize(players: Player[], config: Partial<TConfig>): TState;
  abstract validateMove(state: TState, move: TMove, playerId: string): ValidationResult;
  abstract applyMove(state: TState, move: TMove, playerId: string): { state: TState; events: GameEvent[] };
  abstract calculateScore(state: TState): Map<string, number>;
  abstract isGameOver(state: TState): boolean;
  abstract getWinner(state: TState): string | null;
  abstract getValidMoves(state: TState, playerId: string): TMove[];
  abstract getCurrentPlayerId(state: TState): string;

  processMove(state: TState, move: TMove, playerId: string): { state: TState; events: GameEvent[] } {
    const validation = this.validateMove(state, move, playerId);
    if (!validation.valid) {
      throw new Error(`Invalid move: ${validation.reason}`);
    }
    return this.applyMove(state, move, playerId);
  }
}
