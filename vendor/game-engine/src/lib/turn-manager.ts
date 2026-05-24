/**
 * Manages turn order for multiplayer card games.
 * Supports sequential turns, skipping, and resetting to a specific player.
 */
export class TurnManager {
  private playerIds: string[];
  private currentIndex: number;

  constructor(playerIds: string[], startingIndex: number = 0) {
    if (playerIds.length === 0) {
      throw new Error('TurnManager requires at least one player');
    }
    if (startingIndex < 0 || startingIndex >= playerIds.length) {
      throw new Error(
        `Starting index ${startingIndex} out of bounds for ${playerIds.length} players`
      );
    }
    this.playerIds = [...playerIds];
    this.currentIndex = startingIndex;
  }

  /**
   * Returns the player ID whose turn it currently is.
   */
  getCurrentPlayerId(): string {
    return this.playerIds[this.currentIndex];
  }

  /**
   * Advances to the next player in order and returns their ID.
   */
  nextTurn(): string {
    this.currentIndex = (this.currentIndex + 1) % this.playerIds.length;
    return this.playerIds[this.currentIndex];
  }

  /**
   * Skips the current player's turn and moves to the next player.
   * Returns the new current player ID.
   */
  skipTurn(): string {
    this.currentIndex = (this.currentIndex + 1) % this.playerIds.length;
    return this.playerIds[this.currentIndex];
  }

  /**
   * Resets the turn to a specific player by their ID.
   */
  resetToPlayer(playerId: string): void {
    const index = this.playerIds.indexOf(playerId);
    if (index === -1) {
      throw new Error(`Player ${playerId} not found in turn order`);
    }
    this.currentIndex = index;
  }

  /**
   * Returns the full turn order as an array of player IDs.
   */
  getTurnOrder(): string[] {
    return [...this.playerIds];
  }
}
