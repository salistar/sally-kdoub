import { Card, GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  TarotState,
  TarotMove,
  TarotConfig,
  TarotContract,
  TarotTrickEntry,
  TarotTrick,
} from './tarot.types';

/**
 * Tarot card: trump cards have suit 'spades' and deck 'tarot78', value 0-21.
 * Suited cards have suit hearts/diamonds/clubs/spades and value 1-14.
 * We distinguish trumps by checking id prefix 'tarot78-trump-'.
 */
function isTrump(card: Card): boolean {
  return card.id.startsWith('tarot78-trump-');
}

function isExcuse(card: Card): boolean {
  return card.id === 'tarot78-trump-0';
}

function isOudler(card: Card): boolean {
  // Oudlers: Trump 1 (Petit), Trump 21, and the Excuse (Trump 0)
  if (!isTrump(card)) return false;
  return card.value === 0 || card.value === 1 || card.value === 21;
}

/**
 * Card point values in French Tarot:
 * K (14) = 4.5, Q (13) = 3.5, C/Knight (12) = 2.5, J (11) = 1.5
 * Oudlers (trump 0, 1, 21) = 4.5
 * All others = 0.5
 */
function cardPoints(card: Card): number {
  if (isOudler(card)) return 4.5;
  if (!isTrump(card)) {
    switch (card.value) {
      case 14: return 4.5;  // King
      case 13: return 3.5;  // Queen
      case 12: return 2.5;  // Cavalier/Knight
      case 11: return 1.5;  // Jack
      default: return 0.5;
    }
  }
  return 0.5; // Non-oudler trump
}

/**
 * Required points based on number of oudlers captured by taker.
 */
function requiredPoints(oudlerCount: number): number {
  switch (oudlerCount) {
    case 3: return 36;
    case 2: return 41;
    case 1: return 51;
    case 0: return 56;
    default: return 56;
  }
}

/**
 * Contract multipliers.
 */
function contractMultiplier(contract: TarotContract): number {
  switch (contract) {
    case 'petite': return 1;
    case 'garde': return 2;
    case 'garde_sans': return 4;
    case 'garde_contre': return 6;
  }
}

/**
 * Contract bidding order (higher = stronger).
 */
function contractStrength(contract: TarotContract): number {
  switch (contract) {
    case 'petite': return 1;
    case 'garde': return 2;
    case 'garde_sans': return 3;
    case 'garde_contre': return 4;
  }
}

/**
 * Determine which card wins a trick in Tarot.
 * Trumps beat all suited cards. Higher trump beats lower trump.
 * Within a suit, higher value wins. Excuse never wins (except edge cases).
 */
function determineTrickWinner(trick: TarotTrickEntry[]): string {
  let bestEntry = trick[0];
  let bestStrength = -1;

  // Find the led suit (first non-excuse card)
  let ledSuit: string | null = null;
  for (const entry of trick) {
    if (!isExcuse(entry.card)) {
      if (isTrump(entry.card)) {
        ledSuit = '__trump__';
      } else {
        ledSuit = entry.card.suit;
      }
      break;
    }
  }

  for (const entry of trick) {
    if (isExcuse(entry.card)) {
      // Excuse never wins
      continue;
    }

    let strength: number;
    if (isTrump(entry.card)) {
      strength = 100 + entry.card.value; // Trumps always beat suited cards
    } else if (ledSuit === '__trump__') {
      // Led trump but this is suited: loses
      strength = -1;
    } else if (entry.card.suit === ledSuit) {
      strength = entry.card.value;
    } else {
      // Off-suit, non-trump
      strength = -1;
    }

    if (strength > bestStrength) {
      bestStrength = strength;
      bestEntry = entry;
    }
  }

  return bestEntry.playerId;
}

function cloneState(state: TarotState): TarotState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    dog: state.dog.map((c) => ({ ...c })),
    tricks: state.tricks.map((t) => ({
      cards: t.cards.map((e) => ({ ...e, card: { ...e.card } })),
      winnerId: t.winnerId,
    })),
    currentTrick: state.currentTrick.map((e) => ({ ...e, card: { ...e.card } })),
    takerWonCards: state.takerWonCards.map((c) => ({ ...c })),
    defenseWonCards: state.defenseWonCards.map((c) => ({ ...c })),
  };
}

export class TarotEngine extends GameEngine<TarotState, TarotMove, TarotConfig> {
  readonly gameType = GameType.TAROT;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  private deckManager = new DeckManager();

  initialize(players: Player[], config: Partial<TarotConfig> = {}): TarotState {
    if (players.length !== 4) {
      throw new Error('Tarot requires exactly 4 players');
    }

    const deck = this.deckManager.createDeck('tarot78');
    const shuffled = this.deckManager.shuffle(deck, config.seed);

    // Deal 18 cards each + 6 to dog
    const hands: Record<string, Card[]> = {};
    const dog: Card[] = [];

    // Deal in packets: 3 cards at a time, placing dog cards at specific intervals
    let cardIndex = 0;
    for (const p of players) {
      hands[p.id] = [];
    }

    // Simple deal: first 72 cards to players (18 each), last 6 to dog
    for (let i = 0; i < 72; i++) {
      const playerIdx = i % 4;
      hands[players[playerIdx].id].push(shuffled[cardIndex++]);
    }
    for (let i = 0; i < 6; i++) {
      dog.push(shuffled[cardIndex++]);
    }

    return {
      id: `tarot-${Date.now()}`,
      type: GameType.TAROT,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'bidding',
      createdAt: Date.now(),
      hands,
      dog,
      tricks: [],
      currentTrick: [],
      taker: null,
      contract: null,
      takerWonCards: [],
      defenseWonCards: [],
      excuseOwner: null,
      excusePlayedBy: null,
    };
  }

  validateMove(state: TarotState, move: TarotMove, playerId: string): ValidationResult {
    if (state.phase === 'bidding') {
      return this.validateBiddingMove(state, move, playerId);
    }
    if (state.phase === 'dog') {
      return this.validateDogMove(state, move, playerId);
    }
    if (state.phase === 'playing') {
      return this.validatePlayingMove(state, move, playerId);
    }
    return { valid: false, reason: `Cannot make moves in phase: ${state.phase}` };
  }

  private validateBiddingMove(
    state: TarotState,
    move: TarotMove,
    playerId: string
  ): ValidationResult {
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn to bid' };
    }

    if (move.type === 'pass') return { valid: true };

    if (move.type === 'bid') {
      const validContracts: TarotContract[] = ['petite', 'garde', 'garde_sans', 'garde_contre'];
      if (!validContracts.includes(move.contract)) {
        return { valid: false, reason: 'Invalid contract type' };
      }
      // Must be stronger than current highest bid
      if (state.contract) {
        if (contractStrength(move.contract) <= contractStrength(state.contract)) {
          return { valid: false, reason: 'Must bid higher than current contract' };
        }
      }
      return { valid: true };
    }

    return { valid: false, reason: 'Invalid move type for bidding phase' };
  }

  private validateDogMove(
    state: TarotState,
    move: TarotMove,
    playerId: string
  ): ValidationResult {
    if (playerId !== state.taker) {
      return { valid: false, reason: 'Only the taker can discard' };
    }
    if (move.type !== 'discard') {
      return { valid: false, reason: 'Must discard cards' };
    }

    if (move.cardIds.length !== 6) {
      return { valid: false, reason: 'Must discard exactly 6 cards' };
    }

    const hand = state.hands[playerId] || [];
    for (const cardId of move.cardIds) {
      const card = hand.find((c) => c.id === cardId);
      if (!card) {
        return { valid: false, reason: `Card ${cardId} not in your hand` };
      }
      // Cannot discard Kings
      if (!isTrump(card) && card.value === 14) {
        return { valid: false, reason: 'Cannot discard Kings' };
      }
      // Cannot discard trump 1, 21, or Excuse
      if (isTrump(card) && (card.value === 0 || card.value === 1 || card.value === 21)) {
        return { valid: false, reason: 'Cannot discard oudlers (trump 0, 1, 21)' };
      }
      // Cannot discard trumps unless hand is all trumps + kings
      if (isTrump(card)) {
        const nonTrumpNonKing = hand.filter(
          (c) => !isTrump(c) && c.value !== 14 && !move.cardIds.includes(c.id)
        );
        // Can only discard trumps if no other option
        if (nonTrumpNonKing.length > 0) {
          // Check if remaining non-trump non-king cards would not suffice
          const nonTrumpAvailable = hand.filter(
            (c) => !isTrump(c) && c.value !== 14
          );
          if (nonTrumpAvailable.length >= 6) {
            return { valid: false, reason: 'Cannot discard trumps when non-trump cards are available' };
          }
        }
      }
    }

    if (new Set(move.cardIds).size !== move.cardIds.length) {
      return { valid: false, reason: 'Duplicate card IDs' };
    }

    return { valid: true };
  }

  private validatePlayingMove(
    state: TarotState,
    move: TarotMove,
    playerId: string
  ): ValidationResult {
    if (move.type !== 'playCard') {
      return { valid: false, reason: 'Must play a card during playing phase' };
    }
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    const hand = state.hands[playerId] || [];
    const card = hand.find((c) => c.id === move.cardId);
    if (!card) {
      return { valid: false, reason: 'Card not in your hand' };
    }

    // Excuse can always be played
    if (isExcuse(card)) return { valid: true };

    // First card of trick
    if (state.currentTrick.length === 0) return { valid: true };

    // Determine led suit (first non-excuse card)
    let ledSuit: string | null = null;
    let ledIsTrump = false;
    for (const entry of state.currentTrick) {
      if (!isExcuse(entry.card)) {
        if (isTrump(entry.card)) {
          ledIsTrump = true;
          ledSuit = '__trump__';
        } else {
          ledSuit = entry.card.suit;
        }
        break;
      }
    }

    // If only excuse has been played so far, any card is fine
    if (ledSuit === null) return { valid: true };

    if (ledIsTrump) {
      // Must play trump if have trump
      const hasTrump = hand.some((c) => isTrump(c) && !isExcuse(c));
      if (isTrump(card)) {
        // Must overtrump if possible
        const highestTrump = Math.max(
          ...state.currentTrick
            .filter((e) => isTrump(e.card) && !isExcuse(e.card))
            .map((e) => e.card.value)
        );
        const canOvertrump = hand.some(
          (c) => isTrump(c) && !isExcuse(c) && c.value > highestTrump
        );
        if (canOvertrump && card.value <= highestTrump) {
          return { valid: false, reason: 'Must overtrump when possible' };
        }
        return { valid: true };
      }
      if (hasTrump) {
        return { valid: false, reason: 'Must play trump' };
      }
      return { valid: true }; // No trump, play anything
    }

    // Suited lead
    const hasSuit = hand.some((c) => !isTrump(c) && c.suit === ledSuit);
    if (hasSuit) {
      if (isTrump(card) || card.suit !== ledSuit) {
        return { valid: false, reason: 'Must follow suit' };
      }
      return { valid: true };
    }

    // Cannot follow suit - must play trump
    const hasTrump = hand.some((c) => isTrump(c) && !isExcuse(c));
    if (hasTrump) {
      if (!isTrump(card)) {
        return { valid: false, reason: 'Must play trump when you cannot follow suit' };
      }
      // Must overtrump if possible
      const trumpsPlayed = state.currentTrick.filter(
        (e) => isTrump(e.card) && !isExcuse(e.card)
      );
      if (trumpsPlayed.length > 0) {
        const highestTrump = Math.max(...trumpsPlayed.map((e) => e.card.value));
        const canOvertrump = hand.some(
          (c) => isTrump(c) && !isExcuse(c) && c.value > highestTrump
        );
        if (canOvertrump && card.value <= highestTrump) {
          return { valid: false, reason: 'Must overtrump when possible' };
        }
      }
      return { valid: true };
    }

    // No suit, no trump: play anything
    return { valid: true };
  }

  applyMove(
    state: TarotState,
    move: TarotMove,
    playerId: string
  ): { state: TarotState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    if (state.phase === 'bidding') {
      return this.applyBiddingMove(newState, move, playerId, events);
    }
    if (state.phase === 'dog') {
      return this.applyDogMove(newState, move, playerId, events);
    }
    if (state.phase === 'playing') {
      return this.applyPlayingMove(newState, move, playerId, events);
    }

    return { state: newState, events };
  }

  private applyBiddingMove(
    state: TarotState,
    move: TarotMove,
    playerId: string,
    events: GameEvent[]
  ): { state: TarotState; events: GameEvent[] } {
    const playerIdx = state.players.findIndex((p) => p.id === playerId);

    if (move.type === 'pass') {
      events.push({
        type: 'bidPassed',
        playerId,
        payload: {},
        timestamp: Date.now(),
      });
    } else if (move.type === 'bid') {
      state.taker = playerId;
      state.contract = move.contract;
      events.push({
        type: 'bidPlaced',
        playerId,
        payload: { contract: move.contract },
        timestamp: Date.now(),
      });
    }

    // Check if all players have had a chance to bid
    const nextIdx = (playerIdx + 1) % 4;
    const nextPlayer = state.players[nextIdx];

    // If we've gone around back to the first bidder or past all players
    if (nextIdx === 0 || (state.taker && nextIdx <= playerIdx)) {
      // Bidding is over if everyone after the taker has had a chance
      // Simple: after 4 players have acted
      const isLastBidder = playerIdx === 3 || (playerIdx === state.players.length - 1);

      if (isLastBidder || nextIdx === 0) {
        if (!state.taker) {
          // All passed - game over (redeal)
          state.phase = 'ended';
          state.status = GameStatus.FINISHED;
          events.push({
            type: 'allPassed',
            payload: {},
            timestamp: Date.now(),
          });
          return { state, events };
        }

        // Move to dog phase or playing
        if (state.contract === 'garde_sans') {
          // Dog goes to taker's won cards (counted at end)
          state.takerWonCards.push(...state.dog);
          state.dog = [];
          state.phase = 'playing';
          state.currentPlayerId = state.players[0].id;
          events.push({
            type: 'dogToTaker',
            payload: { contract: state.contract },
            timestamp: Date.now(),
          });
        } else if (state.contract === 'garde_contre') {
          // Dog goes to defense's won cards
          state.defenseWonCards.push(...state.dog);
          state.dog = [];
          state.phase = 'playing';
          state.currentPlayerId = state.players[0].id;
          events.push({
            type: 'dogToDefense',
            payload: { contract: state.contract },
            timestamp: Date.now(),
          });
        } else {
          // Petite or Garde: taker takes dog, must discard 6
          state.hands[state.taker].push(...state.dog);
          state.dog = [];
          state.phase = 'dog';
          state.currentPlayerId = state.taker;
          events.push({
            type: 'dogRevealed',
            payload: { dog: state.dog },
            timestamp: Date.now(),
          });
        }

        return { state, events };
      }
    }

    state.currentPlayerId = nextPlayer.id;
    return { state, events };
  }

  private applyDogMove(
    state: TarotState,
    move: TarotMove,
    playerId: string,
    events: GameEvent[]
  ): { state: TarotState; events: GameEvent[] } {
    if (move.type !== 'discard') return { state, events };

    const hand = state.hands[playerId];
    const discarded: Card[] = [];

    for (const cardId of move.cardIds) {
      const idx = hand.findIndex((c) => c.id === cardId);
      discarded.push(hand.splice(idx, 1)[0]);
    }

    // Discarded cards count toward taker's won cards at end
    state.takerWonCards.push(...discarded);

    state.phase = 'playing';
    state.currentPlayerId = state.players[0].id; // First player leads

    events.push({
      type: 'cardsDiscarded',
      playerId,
      payload: { count: discarded.length },
      timestamp: Date.now(),
    });

    return { state, events };
  }

  private applyPlayingMove(
    state: TarotState,
    move: TarotMove,
    playerId: string,
    events: GameEvent[]
  ): { state: TarotState; events: GameEvent[] } {
    if (move.type !== 'playCard') return { state, events };

    const hand = state.hands[playerId];
    const cardIdx = hand.findIndex((c) => c.id === move.cardId);
    const card = hand.splice(cardIdx, 1)[0];

    // Track excuse
    if (isExcuse(card)) {
      state.excusePlayedBy = playerId;
      // Track who owns the excuse for point exchange
      state.excuseOwner = playerId;
    }

    state.currentTrick.push({ playerId, card });

    events.push({
      type: 'cardPlayed',
      playerId,
      payload: { card },
      timestamp: Date.now(),
    });

    // Check if trick is complete (4 cards)
    if (state.currentTrick.length === 4) {
      const winnerId = determineTrickWinner(state.currentTrick);

      const isTakerTrick = winnerId === state.taker;

      // Collect cards
      const trickCards = state.currentTrick.map((e) => e.card);

      // Handle excuse: it goes to its owner's team, not the trick winner
      const excuseInTrick = trickCards.find((c) => isExcuse(c));
      if (excuseInTrick && state.excuseOwner) {
        const excuseOwnerIsTaker = state.excuseOwner === state.taker;
        const trickWonByTaker = winnerId === state.taker;

        if (excuseOwnerIsTaker && !trickWonByTaker) {
          // Excuse owner is taker but lost trick: excuse goes to taker, rest to defense
          // Taker must give a low card from won pile to defense later
          state.takerWonCards.push(excuseInTrick);
          const otherCards = trickCards.filter((c) => !isExcuse(c));
          state.defenseWonCards.push(...otherCards);
        } else if (!excuseOwnerIsTaker && trickWonByTaker) {
          // Excuse owner is defender but taker won: excuse goes to defense, rest to taker
          state.defenseWonCards.push(excuseInTrick);
          const otherCards = trickCards.filter((c) => !isExcuse(c));
          state.takerWonCards.push(...otherCards);
        } else {
          // Same side owns excuse and won trick
          if (isTakerTrick) {
            state.takerWonCards.push(...trickCards);
          } else {
            state.defenseWonCards.push(...trickCards);
          }
        }
      } else {
        if (isTakerTrick) {
          state.takerWonCards.push(...trickCards);
        } else {
          state.defenseWonCards.push(...trickCards);
        }
      }

      const completedTrick: TarotTrick = {
        cards: [...state.currentTrick],
        winnerId,
      };
      state.tricks.push(completedTrick);
      state.currentTrick = [];
      state.turnNumber++;

      events.push({
        type: 'trickComplete',
        playerId: winnerId,
        payload: { winnerId, trick: completedTrick },
        timestamp: Date.now(),
      });

      // Check if all tricks played (18 tricks: 72 cards / 4 players)
      if (state.tricks.length === 18) {
        this.scoreGame(state, events);
        return { state, events };
      }

      // Winner leads next trick
      state.currentPlayerId = winnerId;
    } else {
      const currentIdx = state.players.findIndex((p) => p.id === playerId);
      state.currentPlayerId = state.players[(currentIdx + 1) % 4].id;
    }

    return { state, events };
  }

  private scoreGame(state: TarotState, events: GameEvent[]): void {
    const takerCards = state.takerWonCards;
    const taker = state.taker!;
    const contract = state.contract!;

    // Count oudlers
    const oudlerCount = takerCards.filter((c) => isOudler(c)).length;

    // Count points
    const takerPoints = takerCards.reduce((sum, c) => sum + cardPoints(c), 0);
    const needed = requiredPoints(oudlerCount);
    const multiplier = contractMultiplier(contract);

    const diff = takerPoints - needed;
    // Base score: 25 + |diff|, multiplied by contract
    const baseScore = (25 + Math.abs(Math.round(diff))) * multiplier;

    const takerWon = diff >= 0;
    const score = takerWon ? baseScore : -baseScore;

    // Taker gets/loses score * 3 (since 3 defenders)
    // Each defender gets/loses the base score
    for (const player of state.players) {
      if (player.id === taker) {
        player.score = score * 3;
      } else {
        player.score = -score;
      }
    }

    state.phase = 'ended';
    state.status = GameStatus.FINISHED;

    events.push({
      type: 'gameScored',
      payload: {
        taker,
        takerPoints,
        oudlerCount,
        needed,
        diff,
        multiplier,
        takerWon,
        score,
      },
      timestamp: Date.now(),
    });

    events.push({
      type: 'gameOver',
      payload: {
        winner: takerWon ? taker : null,
        scores: Object.fromEntries(state.players.map((p) => [p.id, p.score])),
      },
      timestamp: Date.now(),
    });
  }

  calculateScore(state: TarotState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      scores.set(player.id, player.score);
    }
    return scores;
  }

  isGameOver(state: TarotState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: TarotState): string | null {
    if (state.phase !== 'ended') return null;
    // Winner is the player with the highest score
    let maxScore = -Infinity;
    let winnerId: string | null = null;
    for (const player of state.players) {
      if (player.score > maxScore) {
        maxScore = player.score;
        winnerId = player.id;
      }
    }
    return winnerId;
  }

  getValidMoves(state: TarotState, playerId: string): TarotMove[] {
    const moves: TarotMove[] = [];

    if (state.phase === 'bidding' && playerId === state.currentPlayerId) {
      moves.push({ type: 'pass' });
      const contracts: TarotContract[] = ['petite', 'garde', 'garde_sans', 'garde_contre'];
      for (const c of contracts) {
        if (!state.contract || contractStrength(c) > contractStrength(state.contract)) {
          moves.push({ type: 'bid', contract: c });
        }
      }
    }

    if (state.phase === 'dog' && playerId === state.taker) {
      // Generate valid discard combinations (simplified: return empty since
      // there are too many combinations; client should build their own)
      // In practice, we return a marker indicating discard is needed
      // The client will present the UI for selecting 6 cards
    }

    if (state.phase === 'playing' && playerId === state.currentPlayerId) {
      const hand = state.hands[playerId] || [];
      for (const card of hand) {
        const testMove: TarotMove = { type: 'playCard', cardId: card.id };
        const validation = this.validatePlayingMove(state, testMove, playerId);
        if (validation.valid) {
          moves.push(testMove);
        }
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: TarotState): string {
    return state.currentPlayerId;
  }
}
