import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  RondaState,
  RondaMove,
  RondaConfig,
  Announcement,
} from './ronda.types';

/**
 * Get the numeric capture value of a card.
 * In the Spanish 40-card deck values are 1-7, 10-12.
 * For capture matching we use the face value directly.
 */
function captureValue(card: Card): number {
  return card.value;
}

function cloneState(state: RondaState): RondaState {
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
    announcements: state.announcements.map((a) => ({
      ...a,
      cards: a.cards.map((c) => ({ ...c })),
    })),
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
      const card = tableCards[i];
      current.push(card);
      backtrack(i + 1, currentSum + captureValue(card), current);
      current.pop();
    }
  }

  backtrack(0, 0, []);
  return results;
}

/**
 * Check if a capture combination is valid for a given played card.
 */
function isValidCapture(
  playedCard: Card,
  capturedCards: Card[],
  tableCards: Card[]
): boolean {
  const target = captureValue(playedCard);

  // All captured cards must be on the table
  for (const cc of capturedCards) {
    if (!tableCards.some((tc) => tc.id === cc.id)) {
      return false;
    }
  }

  // Single card match
  if (capturedCards.length === 1) {
    return captureValue(capturedCards[0]) === target;
  }

  // Sum match
  const sum = capturedCards.reduce((s, c) => s + captureValue(c), 0);
  return sum === target;
}

/**
 * Check whether any capture is possible for a given card on the table.
 */
function canCapture(card: Card, tableCards: Card[]): boolean {
  const target = captureValue(card);
  // Single match
  if (tableCards.some((tc) => captureValue(tc) === target)) return true;
  // Sum match
  const combos = findCaptureCombinations(tableCards, target);
  return combos.length > 0;
}

export class RondaEngine extends GameEngine<RondaState, RondaMove, RondaConfig> {
  readonly gameType = GameType.RONDA;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  private deckManager = new DeckManager();

  initialize(
    players: Player[],
    config: Partial<RondaConfig> = {}
  ): RondaState {
    const playerCount = config.playerCount ?? players.length;
    if (players.length < 2 || players.length > 4) {
      throw new Error('Ronda requires 2-4 players');
    }
    if (players.length !== playerCount) {
      throw new Error(`Expected ${playerCount} players but got ${players.length}`);
    }

    const targetScore = config.targetScore ?? 21;

    // Create and shuffle a Spanish 40-card deck
    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('spanish40')
    );

    // Deal 3 cards to each player
    const hands: Record<string, Card[]> = {};
    const captured: Record<string, Card[]> = {};
    const scores: Record<string, number> = {};
    const roundScores: Record<string, number> = {};
    let remaining = [...deck];

    for (const player of players) {
      hands[player.id] = remaining.splice(0, 3);
      captured[player.id] = [];
      scores[player.id] = 0;
      roundScores[player.id] = 0;
    }

    // Place 4 cards on the table
    const table = remaining.splice(0, 4);

    return {
      id: `ronda-${Date.now()}`,
      type: GameType.RONDA,
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
      announcements: [],
      lastCapture: null,
      roundNumber: 1,
      targetScore,
    };
  }

  validateMove(
    state: RondaState,
    move: RondaMove,
    playerId: string
  ): ValidationResult {
    if (state.phase === 'ended' || state.phase === 'scoring') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    const hand = state.hands[playerId];
    if (!hand) {
      return { valid: false, reason: 'Player not found' };
    }

    switch (move.type) {
      case 'playCard': {
        const card = hand.find((c) => c.id === move.cardId);
        if (!card) return { valid: false, reason: 'Card not in hand' };
        // If a capture is possible with this card, player must capture
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
          return {
            valid: false,
            reason: 'Invalid capture: values do not match',
          };
        }
        return { valid: true };
      }

      case 'announceRonda': {
        const [id1, id2] = move.cards;
        const c1 = hand.find((c) => c.id === id1);
        const c2 = hand.find((c) => c.id === id2);
        if (!c1 || !c2) return { valid: false, reason: 'Cards not in hand' };
        if (c1.id === c2.id) return { valid: false, reason: 'Must be two different cards' };
        if (c1.value !== c2.value) {
          return { valid: false, reason: 'Cards must have the same value for Ronda' };
        }
        // Check if already announced this pair
        const alreadyAnnounced = state.announcements.some(
          (a) =>
            a.playerId === playerId &&
            a.type === 'ronda' &&
            a.cards.some((ac) => ac.id === c1.id) &&
            a.cards.some((ac) => ac.id === c2.id)
        );
        if (alreadyAnnounced) {
          return { valid: false, reason: 'Already announced this Ronda' };
        }
        return { valid: true };
      }

      case 'announceTringa': {
        const [id1, id2, id3] = move.cards;
        const c1 = hand.find((c) => c.id === id1);
        const c2 = hand.find((c) => c.id === id2);
        const c3 = hand.find((c) => c.id === id3);
        if (!c1 || !c2 || !c3) return { valid: false, reason: 'Cards not in hand' };
        if (new Set([id1, id2, id3]).size !== 3) {
          return { valid: false, reason: 'Must be three different cards' };
        }
        if (c1.value !== c2.value || c2.value !== c3.value) {
          return {
            valid: false,
            reason: 'All three cards must have the same value for Tringa',
          };
        }
        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: RondaState,
    move: RondaMove,
    playerId: string
  ): { state: RondaState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    switch (move.type) {
      case 'playCard': {
        // Remove card from hand and place on table
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

        this.advanceTurn(newState, events, playerId);
        break;
      }

      case 'captureWithCard': {
        const cardIndex = newState.hands[playerId].findIndex(
          (c) => c.id === move.cardId
        );
        const [playedCard] = newState.hands[playerId].splice(cardIndex, 1);

        // Remove captured cards from table
        const capturedCards: Card[] = [];
        for (const capturedId of move.capturedIds) {
          const tableIdx = newState.table.findIndex((c) => c.id === capturedId);
          if (tableIdx !== -1) {
            capturedCards.push(...newState.table.splice(tableIdx, 1));
          }
        }

        // Add played card + captured cards to player's captured pile
        newState.captured[playerId].push(playedCard, ...capturedCards);
        newState.lastCapture = playerId;

        events.push({
          type: 'cardsCapture',
          playerId,
          payload: { playedCard, capturedCards },
          timestamp: Date.now(),
        });

        // Check for Missa (sweep - captured ALL table cards)
        if (newState.table.length === 0) {
          const missaAnnouncement: Announcement = {
            playerId,
            type: 'missa',
            cards: [playedCard, ...capturedCards],
            points: 1,
          };
          newState.announcements.push(missaAnnouncement);
          newState.roundScores[playerId] =
            (newState.roundScores[playerId] || 0) + 1;

          events.push({
            type: 'missa',
            playerId,
            payload: { points: 1 },
            timestamp: Date.now(),
          });
        }

        this.advanceTurn(newState, events, playerId);
        break;
      }

      case 'announceRonda': {
        const [id1, id2] = move.cards;
        const c1 = newState.hands[playerId].find((c) => c.id === id1)!;
        const c2 = newState.hands[playerId].find((c) => c.id === id2)!;

        const announcement: Announcement = {
          playerId,
          type: 'ronda',
          cards: [{ ...c1 }, { ...c2 }],
          points: 1,
        };
        newState.announcements.push(announcement);
        newState.roundScores[playerId] =
          (newState.roundScores[playerId] || 0) + 1;

        events.push({
          type: 'announceRonda',
          playerId,
          payload: { cards: [c1, c2], points: 1 },
          timestamp: Date.now(),
        });
        // Announcement does NOT end the turn -- player still plays a card
        break;
      }

      case 'announceTringa': {
        const [id1, id2, id3] = move.cards;
        const c1 = newState.hands[playerId].find((c) => c.id === id1)!;
        const c2 = newState.hands[playerId].find((c) => c.id === id2)!;
        const c3 = newState.hands[playerId].find((c) => c.id === id3)!;

        const announcement: Announcement = {
          playerId,
          type: 'tringa',
          cards: [{ ...c1 }, { ...c2 }, { ...c3 }],
          points: 5,
        };
        newState.announcements.push(announcement);
        newState.roundScores[playerId] =
          (newState.roundScores[playerId] || 0) + 5;

        events.push({
          type: 'announceTringa',
          playerId,
          payload: { cards: [c1, c2, c3], points: 5 },
          timestamp: Date.now(),
        });
        // Announcement does NOT end the turn
        break;
      }
    }

    return { state: newState, events };
  }

  /**
   * After a card is played/captured, advance the turn.
   * If all hands are empty, either deal new cards or end the round.
   */
  private advanceTurn(
    state: RondaState,
    events: GameEvent[],
    playerId: string
  ): void {
    state.turnNumber++;

    // Check if all hands are empty
    const allHandsEmpty = state.players.every(
      (p) => state.hands[p.id].length === 0
    );

    if (allHandsEmpty) {
      if (state.deck.length >= state.players.length * 3) {
        // Deal 3 more cards to each player
        for (const player of state.players) {
          state.hands[player.id] = state.deck.splice(0, 3);
        }
        events.push({
          type: 'newDeal',
          payload: { cardsRemaining: state.deck.length },
          timestamp: Date.now(),
        });
        // Current player stays the same as next in order after the one who just played
        const currentIdx = state.players.findIndex((p) => p.id === playerId);
        const nextIdx = (currentIdx + 1) % state.players.length;
        state.currentPlayerId = state.players[nextIdx].id;
      } else {
        // End of round - last capturer gets remaining table cards
        if (state.lastCapture) {
          state.captured[state.lastCapture].push(...state.table.splice(0));
        }

        // Score the round
        this.scoreRound(state, events);

        // Check if game is over
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
          // Start a new round
          this.startNewRound(state, events);
        }
      }
    } else {
      // Advance to next player
      const currentIdx = state.players.findIndex((p) => p.id === playerId);
      const nextIdx = (currentIdx + 1) % state.players.length;
      state.currentPlayerId = state.players[nextIdx].id;
    }
  }

  /**
   * Score the current round and add to running scores.
   */
  private scoreRound(state: RondaState, events: GameEvent[]): void {
    state.phase = 'scoring';

    for (const player of state.players) {
      const capturedCount = state.captured[player.id].length;
      // Bonus for having more than 20 cards
      if (capturedCount > 20) {
        state.roundScores[player.id] =
          (state.roundScores[player.id] || 0) + (capturedCount - 20);
      }
    }

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
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Reset game state for a new round, preserving running scores.
   */
  private startNewRound(state: RondaState, events: GameEvent[]): void {
    state.roundNumber++;
    state.phase = 'playing';

    // Create and shuffle a fresh deck
    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('spanish40')
    );

    let remaining = [...deck];

    for (const player of state.players) {
      state.hands[player.id] = remaining.splice(0, 3);
      state.captured[player.id] = [];
      state.roundScores[player.id] = 0;
    }

    state.table = remaining.splice(0, 4);
    state.deck = remaining;
    state.announcements = [];
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

  calculateScore(state: RondaState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      scores.set(player.id, state.scores[player.id] || 0);
    }
    return scores;
  }

  isGameOver(state: RondaState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: RondaState): string | null {
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

  getValidMoves(state: RondaState, playerId: string): RondaMove[] {
    if (playerId !== state.currentPlayerId) return [];
    if (state.phase !== 'playing') return [];

    const hand = state.hands[playerId];
    if (!hand || hand.length === 0) return [];

    const moves: RondaMove[] = [];

    // Check for announcements first
    // Ronda: pair of same value
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (hand[i].value === hand[j].value) {
          // Check not already announced
          const alreadyAnnounced = state.announcements.some(
            (a) =>
              a.playerId === playerId &&
              a.type === 'ronda' &&
              a.cards.some((ac) => ac.id === hand[i].id) &&
              a.cards.some((ac) => ac.id === hand[j].id)
          );
          if (!alreadyAnnounced) {
            moves.push({
              type: 'announceRonda',
              cards: [hand[i].id, hand[j].id],
            });
          }
        }
      }
    }

    // Tringa: three of same value
    if (hand.length === 3 && hand[0].value === hand[1].value && hand[1].value === hand[2].value) {
      const alreadyAnnounced = state.announcements.some(
        (a) => a.playerId === playerId && a.type === 'tringa'
      );
      if (!alreadyAnnounced) {
        moves.push({
          type: 'announceTringa',
          cards: [hand[0].id, hand[1].id, hand[2].id],
        });
      }
    }

    // Card plays
    for (const card of hand) {
      const value = captureValue(card);

      // Find all capture combinations for this card
      const combos = findCaptureCombinations(state.table, value);

      if (combos.length > 0) {
        // Must capture -- offer all valid capture combinations
        for (const combo of combos) {
          moves.push({
            type: 'captureWithCard',
            cardId: card.id,
            capturedIds: combo.map((c) => c.id),
          });
        }
      } else {
        // No capture possible -- can play card to table
        moves.push({ type: 'playCard', cardId: card.id });
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: RondaState): string {
    return state.currentPlayerId;
  }
}
