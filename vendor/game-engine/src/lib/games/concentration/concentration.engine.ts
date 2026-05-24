import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  ConcentrationState,
  ConcentrationMove,
  ConcentrationConfig,
  BoardCell,
} from './concentration.types';

/** Two cards match if they have the same value and same color group */
function cardsMatch(a: Card, b: Card): boolean {
  return a.value === b.value && sameColorGroup(a.suit, b.suit);
}

function sameColorGroup(a: string, b: string): boolean {
  const red = new Set(['hearts', 'diamonds', 'oros', 'copas']);
  const black = new Set(['clubs', 'spades', 'espadas', 'bastos']);
  return (red.has(a) && red.has(b)) || (black.has(a) && black.has(b));
}

function cloneState(state: ConcentrationState): ConcentrationState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    board: state.board.map((cell) => ({ ...cell, card: { ...cell.card } })),
    matchedPairs: { ...state.matchedPairs },
    gridSize: { ...state.gridSize },
  };
}

export class ConcentrationEngine extends GameEngine<
  ConcentrationState,
  ConcentrationMove,
  ConcentrationConfig
> {
  readonly gameType = GameType.CONCENTRATION;
  readonly minPlayers = 1;
  readonly maxPlayers = 4;

  private deckManager = new DeckManager();

  initialize(
    players: Player[],
    config: Partial<ConcentrationConfig> = {}
  ): ConcentrationState {
    if (players.length < 1 || players.length > 4) {
      throw new Error('Concentration requires 1-4 players');
    }

    const gridSize = config.gridSize ?? { rows: 4, cols: 4 };
    const totalCells = gridSize.rows * gridSize.cols;

    if (totalCells % 2 !== 0) {
      throw new Error('Grid must have an even number of cells');
    }

    const totalPairs = totalCells / 2;

    if (totalPairs > 26) {
      throw new Error('Grid is too large - max 26 pairs (52 cards)');
    }

    // Create a deck and pick enough cards for the pairs
    const deck = this.deckManager.createDeck('french52');
    // We need totalPairs unique cards. We'll pick cards and duplicate them.
    // Group cards into matchable pairs: same value + same color
    const pairMap = new Map<string, Card[]>();
    for (const card of deck) {
      const colorGroup = sameColorGroup(card.suit, 'hearts') ? 'red' : 'black';
      const key = `${card.value}-${colorGroup}`;
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(card);
    }

    // Select pairs (each pair is two cards from the same value+color group)
    const selectedCards: Card[] = [];
    let pairsCollected = 0;
    for (const [, cards] of pairMap) {
      if (pairsCollected >= totalPairs) break;
      if (cards.length >= 2) {
        selectedCards.push(cards[0], cards[1]);
        pairsCollected++;
      }
    }

    if (pairsCollected < totalPairs) {
      throw new Error(`Cannot form ${totalPairs} pairs from available cards`);
    }

    // Shuffle the selected cards
    const shuffled = this.deckManager.shuffle(selectedCards, config.seed);

    // Build the board
    const board: BoardCell[] = shuffled.map((card) => ({
      card,
      isRevealed: false,
      isMatched: false,
    }));

    const matchedPairs: Record<string, number> = {};
    for (const player of players) {
      matchedPairs[player.id] = 0;
    }

    return {
      id: `concentration-${Date.now()}`,
      type: GameType.CONCENTRATION,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'playing',
      createdAt: Date.now(),
      board,
      firstPick: null,
      secondPick: null,
      matchedPairs,
      gridSize,
      totalPairs,
    };
  }

  validateMove(
    state: ConcentrationState,
    move: ConcentrationMove,
    playerId: string
  ): ValidationResult {
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is over' };
    }
    if (move.type !== 'reveal') {
      return { valid: false, reason: 'Unknown move type' };
    }
    if (state.secondPick !== null) {
      return { valid: false, reason: 'Two cards already revealed - wait for next turn' };
    }

    const { index } = move;
    if (index < 0 || index >= state.board.length) {
      return { valid: false, reason: 'Invalid board index' };
    }

    const cell = state.board[index];
    if (cell.isMatched) {
      return { valid: false, reason: 'Card already matched' };
    }
    if (cell.isRevealed) {
      return { valid: false, reason: 'Card already revealed' };
    }

    return { valid: true };
  }

  applyMove(
    state: ConcentrationState,
    move: ConcentrationMove,
    playerId: string
  ): { state: ConcentrationState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];
    const { index } = move;

    newState.board[index].isRevealed = true;

    if (newState.firstPick === null) {
      // First card of the turn
      newState.firstPick = index;
      events.push({
        type: 'cardRevealed',
        playerId,
        payload: { index, card: newState.board[index].card },
        timestamp: Date.now(),
      });
    } else {
      // Second card of the turn
      newState.secondPick = index;
      const firstCard = newState.board[newState.firstPick].card;
      const secondCard = newState.board[index].card;

      events.push({
        type: 'cardRevealed',
        playerId,
        payload: { index, card: secondCard },
        timestamp: Date.now(),
      });

      if (cardsMatch(firstCard, secondCard)) {
        // Match found
        newState.board[newState.firstPick].isMatched = true;
        newState.board[index].isMatched = true;
        newState.matchedPairs[playerId] = (newState.matchedPairs[playerId] || 0) + 1;

        events.push({
          type: 'pairMatched',
          playerId,
          payload: {
            indices: [newState.firstPick, index],
            totalPairs: newState.matchedPairs[playerId],
          },
          timestamp: Date.now(),
        });

        // Reset picks - player gets another turn
        newState.firstPick = null;
        newState.secondPick = null;

        // Check if game is over
        const totalMatched = Object.values(newState.matchedPairs).reduce(
          (sum, count) => sum + count,
          0
        );
        if (totalMatched >= newState.totalPairs) {
          newState.phase = 'ended';
          newState.status = GameStatus.FINISHED;
          events.push({
            type: 'gameOver',
            payload: { matchedPairs: newState.matchedPairs },
            timestamp: Date.now(),
          });
        }
      } else {
        // No match - flip cards back and advance to next player
        newState.board[newState.firstPick].isRevealed = false;
        newState.board[index].isRevealed = false;
        newState.firstPick = null;
        newState.secondPick = null;

        events.push({
          type: 'pairMismatch',
          playerId,
          payload: { indices: [state.firstPick!, index] },
          timestamp: Date.now(),
        });

        // Next player
        const currentIdx = newState.players.findIndex(
          (p) => p.id === playerId
        );
        const nextIdx = (currentIdx + 1) % newState.players.length;
        newState.currentPlayerId = newState.players[nextIdx].id;
      }

      newState.turnNumber++;
    }

    return { state: newState, events };
  }

  calculateScore(state: ConcentrationState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      scores.set(player.id, state.matchedPairs[player.id] || 0);
    }
    return scores;
  }

  isGameOver(state: ConcentrationState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: ConcentrationState): string | null {
    if (state.phase !== 'ended') return null;

    let maxPairs = -1;
    let winnerId: string | null = null;
    let tie = false;

    for (const player of state.players) {
      const pairs = state.matchedPairs[player.id] || 0;
      if (pairs > maxPairs) {
        maxPairs = pairs;
        winnerId = player.id;
        tie = false;
      } else if (pairs === maxPairs) {
        tie = true;
      }
    }

    return tie ? null : winnerId;
  }

  getValidMoves(state: ConcentrationState, playerId: string): ConcentrationMove[] {
    if (playerId !== state.currentPlayerId) return [];
    if (state.phase !== 'playing') return [];
    if (state.secondPick !== null) return [];

    const moves: ConcentrationMove[] = [];
    for (let i = 0; i < state.board.length; i++) {
      const cell = state.board[i];
      if (!cell.isMatched && !cell.isRevealed) {
        moves.push({ type: 'reveal', index: i });
      }
    }
    return moves;
  }

  getCurrentPlayerId(state: ConcentrationState): string {
    return state.currentPlayerId;
  }
}
