import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import { ScopaState, ScopaMove, ScopaConfig } from './scopa.types';

/**
 * Primiera card values used for scoring.
 * 7=21, 6=18, Ace(1)=16, 5=15, 4=14, 3=13, 2=12, Face(10,11,12)=10
 */
function primieraValue(card: Card): number {
  switch (card.value) {
    case 7:
      return 21;
    case 6:
      return 18;
    case 1:
      return 16;
    case 5:
      return 15;
    case 4:
      return 14;
    case 3:
      return 13;
    case 2:
      return 12;
    default:
      return 10; // 10, 11, 12 (face cards)
  }
}

function captureValue(card: Card): number {
  return card.value;
}

function cloneState(state: ScopaState): ScopaState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    deck: state.deck.map((c) => ({ ...c })),
    table: state.table.map((c) => ({ ...c })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    captured: Object.fromEntries(
      Object.entries(state.captured).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    scores: { ...state.scores },
    roundScores: { ...state.roundScores },
    scopas: { ...state.scopas },
  };
}

/**
 * Find all subsets of table cards whose values sum to a target value.
 */
function findCaptureCombinations(
  tableCards: Card[],
  targetValue: number
): Card[][] {
  const results: Card[][] = [];

  function backtrack(start: number, currentSum: number, current: Card[]): void {
    if (currentSum === targetValue && current.length > 0) {
      results.push([...current]);
    }
    if (currentSum >= targetValue) return;

    for (let i = start; i < tableCards.length; i++) {
      current.push(tableCards[i]);
      backtrack(i + 1, currentSum + captureValue(tableCards[i]), current);
      current.pop();
    }
  }

  backtrack(0, 0, []);
  return results;
}

function canCapture(card: Card, tableCards: Card[]): boolean {
  const target = captureValue(card);
  const combos = findCaptureCombinations(tableCards, target);
  return combos.length > 0;
}

function isValidCapture(
  playedCard: Card,
  capturedCards: Card[],
  tableCards: Card[]
): boolean {
  const target = captureValue(playedCard);

  for (const cc of capturedCards) {
    if (!tableCards.some((tc) => tc.id === cc.id)) {
      return false;
    }
  }

  if (capturedCards.length === 1) {
    return captureValue(capturedCards[0]) === target;
  }

  const sum = capturedCards.reduce((s, c) => s + captureValue(c), 0);
  return sum === target;
}

export class ScopaEngine extends GameEngine<ScopaState, ScopaMove, ScopaConfig> {
  readonly gameType = GameType.SCOPA;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  private deckManager = new DeckManager();

  initialize(
    players: Player[],
    config: Partial<ScopaConfig> = {}
  ): ScopaState {
    if (players.length < 2 || players.length > 4) {
      throw new Error('Scopa requires 2-4 players');
    }

    const targetScore = config.targetScore ?? 11;

    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('spanish40')
    );

    const hands: Record<string, Card[]> = {};
    const captured: Record<string, Card[]> = {};
    const scores: Record<string, number> = {};
    const roundScores: Record<string, number> = {};
    const scopas: Record<string, number> = {};
    let remaining = [...deck];

    for (const player of players) {
      hands[player.id] = remaining.splice(0, 3);
      captured[player.id] = [];
      scores[player.id] = 0;
      roundScores[player.id] = 0;
      scopas[player.id] = 0;
    }

    const table = remaining.splice(0, 4);

    return {
      id: `scopa-${Date.now()}`,
      type: GameType.SCOPA,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'playing',
      createdAt: Date.now(),
      deck: remaining,
      table,
      hands,
      captured,
      scores,
      roundScores,
      scopas,
      lastCapture: null,
      roundNumber: 1,
      targetScore,
    };
  }

  validateMove(
    state: ScopaState,
    move: ScopaMove,
    playerId: string
  ): ValidationResult {
    if (state.phase === 'ended' || state.phase === 'scoring') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    const hand = state.hands[playerId];
    if (!hand) return { valid: false, reason: 'Player not found' };

    switch (move.type) {
      case 'playCard': {
        const card = hand.find((c) => c.id === move.cardId);
        if (!card) return { valid: false, reason: 'Card not in hand' };
        // If any card in hand can capture, the player must capture
        // But specifically if THIS card can capture, it must capture
        if (canCapture(card, state.table)) {
          return {
            valid: false,
            reason: 'A capture is possible with this card; you must capture',
          };
        }
        return { valid: true };
      }

      case 'captureWithCard': {
        const card = hand.find((c) => c.id === move.cardId);
        if (!card) return { valid: false, reason: 'Card not in hand' };
        if (move.capturedIds.length === 0) {
          return { valid: false, reason: 'Must specify cards to capture' };
        }
        const capturedCards = move.capturedIds.map((id) =>
          state.table.find((tc) => tc.id === id)
        );
        if (capturedCards.some((c) => c === undefined)) {
          return { valid: false, reason: 'Some captured cards not on table' };
        }
        if (!isValidCapture(card, capturedCards as Card[], state.table)) {
          return { valid: false, reason: 'Invalid capture: values do not match' };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: ScopaState,
    move: ScopaMove,
    playerId: string
  ): { state: ScopaState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    switch (move.type) {
      case 'playCard': {
        const cardIndex = newState.hands[playerId].findIndex(
          (c) => c.id === move.cardId
        );
        const [card] = newState.hands[playerId].splice(cardIndex, 1);
        newState.table.push(card);

        events.push({
          type: 'cardPlayed',
          playerId,
          payload: { card },
          timestamp: Date.now(),
        });

        this.advanceTurn(newState, events, playerId, false);
        break;
      }

      case 'captureWithCard': {
        const cardIndex = newState.hands[playerId].findIndex(
          (c) => c.id === move.cardId
        );
        const [playedCard] = newState.hands[playerId].splice(cardIndex, 1);

        const capturedCards: Card[] = [];
        for (const capturedId of move.capturedIds) {
          const tableIdx = newState.table.findIndex((c) => c.id === capturedId);
          if (tableIdx !== -1) {
            capturedCards.push(...newState.table.splice(tableIdx, 1));
          }
        }

        newState.captured[playerId].push(playedCard, ...capturedCards);
        newState.lastCapture = playerId;

        events.push({
          type: 'cardsCapture',
          playerId,
          payload: { playedCard, capturedCards },
          timestamp: Date.now(),
        });

        // Check for Scopa (table cleared)
        const isLastPlay = this.isLastPlayOfRound(newState);
        if (newState.table.length === 0 && !isLastPlay) {
          newState.scopas[playerId] = (newState.scopas[playerId] || 0) + 1;
          newState.roundScores[playerId] =
            (newState.roundScores[playerId] || 0) + 1;

          events.push({
            type: 'scopa',
            playerId,
            payload: { scopaCount: newState.scopas[playerId] },
            timestamp: Date.now(),
          });
        }

        this.advanceTurn(newState, events, playerId, false);
        break;
      }
    }

    return { state: newState, events };
  }

  /**
   * Check if this is the very last play of the round (all hands empty after this, no deck left).
   */
  private isLastPlayOfRound(state: ScopaState): boolean {
    const allHandsEmpty = state.players.every(
      (p) => state.hands[p.id].length === 0
    );
    return allHandsEmpty && state.deck.length === 0;
  }

  private advanceTurn(
    state: ScopaState,
    events: GameEvent[],
    playerId: string,
    _isPlay: boolean
  ): void {
    state.turnNumber++;

    const allHandsEmpty = state.players.every(
      (p) => state.hands[p.id].length === 0
    );

    if (allHandsEmpty) {
      if (state.deck.length >= state.players.length * 3) {
        // Deal 3 more cards
        for (const player of state.players) {
          state.hands[player.id] = state.deck.splice(0, 3);
        }
        events.push({
          type: 'newDeal',
          payload: { cardsRemaining: state.deck.length },
          timestamp: Date.now(),
        });
        const currentIdx = state.players.findIndex((p) => p.id === playerId);
        const nextIdx = (currentIdx + 1) % state.players.length;
        state.currentPlayerId = state.players[nextIdx].id;
      } else {
        // End of round
        if (state.lastCapture) {
          state.captured[state.lastCapture].push(...state.table.splice(0));
        }

        this.scoreRound(state, events);

        const gameOver = state.players.some(
          (p) => state.scores[p.id] >= state.targetScore
        );

        if (gameOver) {
          state.phase = 'ended';
          state.status = GameStatus.FINISHED;
          events.push({
            type: 'gameOver',
            payload: { scores: { ...state.scores } },
            timestamp: Date.now(),
          });
        } else {
          this.startNewRound(state, events);
        }
      }
    } else {
      const currentIdx = state.players.findIndex((p) => p.id === playerId);
      const nextIdx = (currentIdx + 1) % state.players.length;
      state.currentPlayerId = state.players[nextIdx].id;
    }
  }

  private scoreRound(state: ScopaState, events: GameEvent[]): void {
    state.phase = 'scoring';

    // 1. Carte: most cards captured
    let maxCards = 0;
    let carteWinner: string | null = null;
    let carteTie = false;

    for (const player of state.players) {
      const count = state.captured[player.id].length;
      if (count > maxCards) {
        maxCards = count;
        carteWinner = player.id;
        carteTie = false;
      } else if (count === maxCards) {
        carteTie = true;
      }
    }

    if (!carteTie && carteWinner) {
      state.roundScores[carteWinner] =
        (state.roundScores[carteWinner] || 0) + 1;
    }

    // 2. Denari: most Oros cards captured
    let maxOros = 0;
    let denariWinner: string | null = null;
    let denariTie = false;

    for (const player of state.players) {
      const orosCount = state.captured[player.id].filter(
        (c) => c.suit === 'oros'
      ).length;
      if (orosCount > maxOros) {
        maxOros = orosCount;
        denariWinner = player.id;
        denariTie = false;
      } else if (orosCount === maxOros) {
        denariTie = true;
      }
    }

    if (!denariTie && denariWinner) {
      state.roundScores[denariWinner] =
        (state.roundScores[denariWinner] || 0) + 1;
    }

    // 3. Settebello: 7 of Oros
    for (const player of state.players) {
      const hasSettebello = state.captured[player.id].some(
        (c) => c.suit === 'oros' && c.value === 7
      );
      if (hasSettebello) {
        state.roundScores[player.id] =
          (state.roundScores[player.id] || 0) + 1;
        break;
      }
    }

    // 4. Primiera: for each suit, take the best card (highest primiera value)
    // The player with the highest total primiera score gets 1 point
    let maxPrimiera = 0;
    let primieraWinner: string | null = null;
    let primieraTie = false;
    const suits = ['oros', 'copas', 'espadas', 'bastos'];

    for (const player of state.players) {
      let total = 0;
      let hasFourSuits = true;

      for (const suit of suits) {
        const suitCards = state.captured[player.id].filter(
          (c) => c.suit === suit
        );
        if (suitCards.length === 0) {
          hasFourSuits = false;
          break;
        }
        const bestValue = Math.max(...suitCards.map(primieraValue));
        total += bestValue;
      }

      if (!hasFourSuits) continue;

      if (total > maxPrimiera) {
        maxPrimiera = total;
        primieraWinner = player.id;
        primieraTie = false;
      } else if (total === maxPrimiera) {
        primieraTie = true;
      }
    }

    if (!primieraTie && primieraWinner) {
      state.roundScores[primieraWinner] =
        (state.roundScores[primieraWinner] || 0) + 1;
    }

    // 5. Scopa points already added during play

    // Add round scores to running scores
    for (const player of state.players) {
      state.scores[player.id] =
        (state.scores[player.id] || 0) +
        (state.roundScores[player.id] || 0);
    }

    events.push({
      type: 'roundScored',
      payload: {
        roundScores: { ...state.roundScores },
        totalScores: { ...state.scores },
        roundNumber: state.roundNumber,
        carte: carteTie ? null : carteWinner,
        denari: denariTie ? null : denariWinner,
        primiera: primieraTie ? null : primieraWinner,
      },
      timestamp: Date.now(),
    });
  }

  private startNewRound(state: ScopaState, events: GameEvent[]): void {
    state.roundNumber++;
    state.phase = 'playing';

    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('spanish40')
    );

    let remaining = [...deck];

    for (const player of state.players) {
      state.hands[player.id] = remaining.splice(0, 3);
      state.captured[player.id] = [];
      state.roundScores[player.id] = 0;
      state.scopas[player.id] = 0;
    }

    state.table = remaining.splice(0, 4);
    state.deck = remaining;
    state.lastCapture = null;

    // Rotate starting player
    const prevStartIdx = state.players.findIndex(
      (p) => p.id === state.currentPlayerId
    );
    const newStartIdx = (prevStartIdx + 1) % state.players.length;
    state.currentPlayerId = state.players[newStartIdx].id;

    events.push({
      type: 'newRound',
      payload: { roundNumber: state.roundNumber },
      timestamp: Date.now(),
    });
  }

  calculateScore(state: ScopaState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      scores.set(player.id, state.scores[player.id] || 0);
    }
    return scores;
  }

  isGameOver(state: ScopaState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: ScopaState): string | null {
    if (state.phase !== 'ended') return null;

    let maxScore = -1;
    let winnerId: string | null = null;
    let tie = false;

    for (const player of state.players) {
      const score = state.scores[player.id] || 0;
      if (score > maxScore) {
        maxScore = score;
        winnerId = player.id;
        tie = false;
      } else if (score === maxScore) {
        tie = true;
      }
    }

    return tie ? null : winnerId;
  }

  getValidMoves(state: ScopaState, playerId: string): ScopaMove[] {
    if (playerId !== state.currentPlayerId) return [];
    if (state.phase !== 'playing') return [];

    const hand = state.hands[playerId];
    if (!hand || hand.length === 0) return [];

    const moves: ScopaMove[] = [];

    for (const card of hand) {
      const value = captureValue(card);
      const combos = findCaptureCombinations(state.table, value);

      if (combos.length > 0) {
        for (const combo of combos) {
          moves.push({
            type: 'captureWithCard',
            cardId: card.id,
            capturedIds: combo.map((c) => c.id),
          });
        }
      } else {
        moves.push({ type: 'playCard', cardId: card.id });
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: ScopaState): string {
    return state.currentPlayerId;
  }
}
