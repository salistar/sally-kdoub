import { Card, GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import { KdoubState, KdoubMove, KdoubConfig, KdoubClaim } from './kdoub.types';

function cloneState(state: KdoubState): KdoubState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    pile: state.pile.map((c) => ({ ...c })),
    lastClaim: state.lastClaim ? { ...state.lastClaim } : null,
  };
}

/** Value cycle for sequential mode: A(1)->2->3...->K(13)->A(1) */
function nextSequentialValue(current: number): number {
  if (current >= 13) return 1;
  return current + 1;
}

export class KdoubEngine extends GameEngine<KdoubState, KdoubMove, KdoubConfig> {
  readonly gameType = GameType.KDOUB;
  readonly minPlayers = 2;
  readonly maxPlayers = 6;

  private deckManager = new DeckManager();

  initialize(players: Player[], config: Partial<KdoubConfig> = {}): KdoubState {
    if (players.length < this.minPlayers || players.length > this.maxPlayers) {
      throw new Error(`Kdoub requires ${this.minPlayers}-${this.maxPlayers} players`);
    }

    const mode = config.mode ?? 'sequential';
    const deck = this.deckManager.createDeck('french52');
    const shuffled = this.deckManager.shuffle(deck, config.seed);

    // Deal all cards evenly; remainder cards go to first players
    const hands: Record<string, Card[]> = {};
    for (const p of players) {
      hands[p.id] = [];
    }

    for (let i = 0; i < shuffled.length; i++) {
      const playerIdx = i % players.length;
      hands[players[playerIdx].id].push(shuffled[i]);
    }

    return {
      id: `kdoub-${Date.now()}`,
      type: GameType.KDOUB,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'playing',
      createdAt: Date.now(),
      hands,
      pile: [],
      lastClaim: null,
      currentDeclaredValue: 0, // will start at 1 (Ace) on first play in sequential
      mode,
    };
  }

  validateMove(state: KdoubState, move: KdoubMove, playerId: string): ValidationResult {
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }

    if (move.type === 'callBluff') {
      // Any player can call bluff, but there must be a previous claim
      if (!state.lastClaim) {
        return { valid: false, reason: 'No claim to challenge' };
      }
      // Cannot call bluff on yourself
      if (state.lastClaim.playerId === playerId) {
        return { valid: false, reason: 'Cannot call bluff on yourself' };
      }
      return { valid: true };
    }

    if (move.type === 'playCards') {
      // Only current player can play cards
      if (playerId !== state.currentPlayerId) {
        return { valid: false, reason: 'Not your turn to play cards' };
      }

      const { cardIds, claimedValue } = move;

      if (!cardIds || cardIds.length === 0 || cardIds.length > 4) {
        return { valid: false, reason: 'Must play 1-4 cards' };
      }

      if (claimedValue < 1 || claimedValue > 13) {
        return { valid: false, reason: 'Claimed value must be between 1 (Ace) and 13 (King)' };
      }

      // Check player has these cards
      const hand = state.hands[playerId] || [];
      for (const cardId of cardIds) {
        if (!hand.some((c) => c.id === cardId)) {
          return { valid: false, reason: `Card ${cardId} not in your hand` };
        }
      }

      // Check for duplicate card IDs
      if (new Set(cardIds).size !== cardIds.length) {
        return { valid: false, reason: 'Duplicate card IDs' };
      }

      // Sequential mode: must follow the value cycle
      if (state.mode === 'sequential') {
        const expectedValue = nextSequentialValue(state.currentDeclaredValue);
        if (claimedValue !== expectedValue) {
          return {
            valid: false,
            reason: `In sequential mode, must claim value ${expectedValue}`,
          };
        }
      }

      return { valid: true };
    }

    return { valid: false, reason: 'Unknown move type' };
  }

  applyMove(
    state: KdoubState,
    move: KdoubMove,
    playerId: string
  ): { state: KdoubState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    if (move.type === 'playCards') {
      const { cardIds, claimedValue } = move;
      const hand = newState.hands[playerId];

      // Remove cards from hand, add to pile face-down
      const playedCards: Card[] = [];
      for (const cardId of cardIds) {
        const idx = hand.findIndex((c) => c.id === cardId);
        playedCards.push(hand.splice(idx, 1)[0]);
      }
      newState.pile.push(...playedCards);

      newState.lastClaim = {
        playerId,
        claimedValue,
        cardCount: cardIds.length,
      };
      newState.currentDeclaredValue = claimedValue;
      newState.turnNumber++;

      events.push({
        type: 'cardsPlayed',
        playerId,
        payload: {
          cardCount: cardIds.length,
          claimedValue,
          // Don't reveal actual cards in event (they're face-down)
        },
        timestamp: Date.now(),
      });

      // Check if player has emptied their hand
      if (hand.length === 0) {
        newState.phase = 'ended';
        newState.status = GameStatus.FINISHED;
        events.push({
          type: 'gameOver',
          playerId,
          payload: { winnerId: playerId, reason: 'emptiedHand' },
          timestamp: Date.now(),
        });
        return { state: newState, events };
      }

      // Advance to next player
      const currentIdx = newState.players.findIndex((p) => p.id === playerId);
      const nextIdx = (currentIdx + 1) % newState.players.length;
      newState.currentPlayerId = newState.players[nextIdx].id;

      return { state: newState, events };
    }

    if (move.type === 'callBluff') {
      const claim = newState.lastClaim!;
      const claimerId = claim.playerId;

      // Get the last N cards from the pile (the ones the claimer placed)
      const challengedCards = newState.pile.slice(-claim.cardCount);

      // Check if claim was truthful: all played cards match the claimed value
      const claimWasTruthful = challengedCards.every(
        (c) => c.value === claim.claimedValue
      );

      let loserId: string;

      if (claimWasTruthful) {
        // Bluffer was wrong - bluffer takes the pile
        loserId = playerId;
        events.push({
          type: 'bluffCallFailed',
          playerId,
          payload: {
            callerId: playerId,
            claimerId,
            challengedCards,
            claimWasTruthful: true,
          },
          timestamp: Date.now(),
        });
      } else {
        // Bluffer was right - claimer takes the pile
        loserId = claimerId;
        events.push({
          type: 'bluffCallSucceeded',
          playerId,
          payload: {
            callerId: playerId,
            claimerId,
            challengedCards,
            claimWasTruthful: false,
          },
          timestamp: Date.now(),
        });
      }

      // Loser takes the entire pile
      newState.hands[loserId].push(...newState.pile);
      newState.pile = [];
      newState.lastClaim = null;

      // If in sequential mode, reset declared value so next play starts fresh
      if (newState.mode === 'sequential') {
        newState.currentDeclaredValue = 0;
      }

      // Loser starts next turn
      newState.currentPlayerId = loserId;
      newState.turnNumber++;

      events.push({
        type: 'pileTaken',
        playerId: loserId,
        payload: { cardCount: newState.hands[loserId].length },
        timestamp: Date.now(),
      });

      return { state: newState, events };
    }

    return { state: newState, events };
  }

  calculateScore(state: KdoubState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      // Score is inverse of cards in hand (fewer cards = better)
      const cardsInHand = (state.hands[player.id] || []).length;
      scores.set(player.id, -cardsInHand);
    }
    return scores;
  }

  isGameOver(state: KdoubState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: KdoubState): string | null {
    if (state.phase !== 'ended') return null;
    // Winner is the player with 0 cards
    for (const player of state.players) {
      if ((state.hands[player.id] || []).length === 0) {
        return player.id;
      }
    }
    return null;
  }

  getValidMoves(state: KdoubState, playerId: string): KdoubMove[] {
    if (state.phase !== 'playing') return [];

    const moves: KdoubMove[] = [];

    // Any player can call bluff if there's a claim and it's not their own
    if (state.lastClaim && state.lastClaim.playerId !== playerId) {
      moves.push({ type: 'callBluff' });
    }

    // Only current player can play cards
    if (playerId === state.currentPlayerId) {
      const hand = state.hands[playerId] || [];
      if (hand.length === 0) return moves;

      const claimedValue =
        state.mode === 'sequential'
          ? nextSequentialValue(state.currentDeclaredValue)
          : null;

      // Generate all combinations of 1-4 cards from hand
      const maxCards = Math.min(4, hand.length);
      for (let count = 1; count <= maxCards; count++) {
        const combos = this.combinations(hand, count);
        for (const combo of combos) {
          const cardIds = combo.map((c) => c.id);
          if (state.mode === 'sequential') {
            moves.push({ type: 'playCards', cardIds, claimedValue: claimedValue! });
          } else {
            // In free mode, can claim any value
            for (let v = 1; v <= 13; v++) {
              moves.push({ type: 'playCards', cardIds, claimedValue: v });
            }
          }
        }
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: KdoubState): string {
    return state.currentPlayerId;
  }

  private combinations(cards: Card[], k: number): Card[][] {
    if (k === 0) return [[]];
    if (cards.length === 0) return [];
    if (k > cards.length) return [];

    const [first, ...rest] = cards;
    const withFirst = this.combinations(rest, k - 1).map((combo) => [first, ...combo]);
    const withoutFirst = this.combinations(rest, k);
    return [...withFirst, ...withoutFirst];
  }
}
