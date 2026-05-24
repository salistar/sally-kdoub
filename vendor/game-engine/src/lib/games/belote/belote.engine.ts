import { Card, GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  BeloteState,
  BeloteMove,
  BeloteConfig,
  BeloteContract,
  TrickEntry,
  Trick,
} from './belote.types';

// Trump card point values: J=20, 9=14, A=11, 10=10, K=4, Q=3, 8=0, 7=0
const TRUMP_VALUES: Record<number, number> = {
  11: 20, // Jack
  9: 14,
  1: 11,  // Ace
  10: 10,
  13: 4,  // King
  12: 3,  // Queen
  8: 0,
  7: 0,
};

// Trump card ordering for comparison (higher = stronger)
const TRUMP_ORDER: Record<number, number> = {
  11: 8, // Jack highest
  9: 7,
  1: 6,  // Ace
  10: 5,
  13: 4,
  12: 3,
  8: 2,
  7: 1,
};

// Non-trump card point values: A=11, 10=10, K=4, Q=3, J=2, 9=0, 8=0, 7=0
const NON_TRUMP_VALUES: Record<number, number> = {
  1: 11,  // Ace
  10: 10,
  13: 4,  // King
  12: 3,  // Queen
  11: 2,  // Jack
  9: 0,
  8: 0,
  7: 0,
};

// Non-trump ordering for comparison
const NON_TRUMP_ORDER: Record<number, number> = {
  1: 8,  // Ace highest
  10: 7,
  13: 6,
  12: 5,
  11: 4,
  9: 3,
  8: 2,
  7: 1,
};

function getCardPoints(card: Card, trumpSuit: string): number {
  if (card.suit === trumpSuit) {
    return TRUMP_VALUES[card.value] ?? 0;
  }
  return NON_TRUMP_VALUES[card.value] ?? 0;
}

function getCardStrength(card: Card, trumpSuit: string): number {
  if (card.suit === trumpSuit) {
    return 100 + (TRUMP_ORDER[card.value] ?? 0); // Trump always beats non-trump
  }
  return NON_TRUMP_ORDER[card.value] ?? 0;
}

function getTeamIndex(playerId: string, teams: [string[], string[]]): number {
  if (teams[0].includes(playerId)) return 0;
  if (teams[1].includes(playerId)) return 1;
  return -1;
}

function cloneState(state: BeloteState): BeloteState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    tricks: state.tricks.map((t) => ({
      cards: t.cards.map((e) => ({ ...e, card: { ...e.card } })),
      winnerId: t.winnerId,
    })),
    currentTrick: state.currentTrick.map((e) => ({ ...e, card: { ...e.card } })),
    contract: state.contract ? { ...state.contract } : null,
    teams: [[...state.teams[0]], [...state.teams[1]]],
    teamScores: [...state.teamScores] as [number, number],
    roundScores: [...state.roundScores] as [number, number],
    biddingHistory: state.biddingHistory.map((b) => ({ ...b })),
    beloteRebelote: state.beloteRebelote ? { ...state.beloteRebelote } : null,
  };
}

/**
 * Determine the winner of a completed trick.
 */
function determineTrickWinner(trick: TrickEntry[], trumpSuit: string): string {
  const ledSuit = trick[0].card.suit;
  let bestEntry = trick[0];
  let bestStrength = 0;

  for (const entry of trick) {
    let strength: number;

    if (entry.card.suit === trumpSuit) {
      // Trump card
      strength = 100 + (TRUMP_ORDER[entry.card.value] ?? 0);
    } else if (entry.card.suit === ledSuit) {
      // Following suit
      strength = NON_TRUMP_ORDER[entry.card.value] ?? 0;
    } else {
      // Off-suit, non-trump: cannot win
      strength = -1;
    }

    if (strength > bestStrength) {
      bestStrength = strength;
      bestEntry = entry;
    }
  }

  return bestEntry.playerId;
}

/**
 * Check if the player holds King and Queen of trump suit.
 */
function hasBeloteRebelote(hand: Card[], trumpSuit: string): boolean {
  const hasKing = hand.some((c) => c.suit === trumpSuit && c.value === 13);
  const hasQueen = hand.some((c) => c.suit === trumpSuit && c.value === 12);
  return hasKing && hasQueen;
}

/**
 * Validate that a card play follows Belote rules:
 * - Must follow suit if possible
 * - Must play trump if can't follow suit and partner is NOT winning
 * - Must overtrump if possible
 */
function isValidCardPlay(
  card: Card,
  hand: Card[],
  currentTrick: TrickEntry[],
  trumpSuit: string
): boolean {
  // First card of trick: anything goes
  if (currentTrick.length === 0) return true;

  const ledSuit = currentTrick[0].card.suit;
  const hasSuit = hand.some((c) => c.suit === ledSuit);
  const hasTrump = hand.some((c) => c.suit === trumpSuit);

  if (hasSuit) {
    // Must follow suit
    if (card.suit !== ledSuit) return false;

    // If led suit is trump, must overtrump if possible
    if (ledSuit === trumpSuit) {
      const highestTrumpPlayed = Math.max(
        ...currentTrick
          .filter((e) => e.card.suit === trumpSuit)
          .map((e) => TRUMP_ORDER[e.card.value] ?? 0)
      );
      const cardTrumpOrder = TRUMP_ORDER[card.value] ?? 0;
      const canOvertrump = hand.some(
        (c) =>
          c.suit === trumpSuit && (TRUMP_ORDER[c.value] ?? 0) > highestTrumpPlayed
      );
      if (canOvertrump && cardTrumpOrder <= highestTrumpPlayed) {
        return false;
      }
    }

    return true;
  }

  // Cannot follow suit
  if (ledSuit !== trumpSuit) {
    // Check if partner is currently winning
    const partnerIsWinning = false; // Will be checked externally
    // For simplicity in validation, we enforce: must play trump if have trump
    // (The full partner-winning check is done in validateMove)

    if (card.suit === trumpSuit) {
      // Playing trump - must overtrump if possible
      const highestTrumpPlayed = Math.max(
        0,
        ...currentTrick
          .filter((e) => e.card.suit === trumpSuit)
          .map((e) => TRUMP_ORDER[e.card.value] ?? 0)
      );
      const cardTrumpOrder = TRUMP_ORDER[card.value] ?? 0;
      const canOvertrump = hand.some(
        (c) =>
          c.suit === trumpSuit && (TRUMP_ORDER[c.value] ?? 0) > highestTrumpPlayed
      );
      if (canOvertrump && cardTrumpOrder <= highestTrumpPlayed) {
        return false;
      }
      return true;
    }

    // Not following suit and not playing trump
    if (hasTrump) {
      // Must play trump (unless partner is winning - checked in validateMove)
      return false;
    }

    // No suit, no trump: play anything
    return true;
  }

  // Led suit is trump but we said we don't have it - contradiction
  // This shouldn't happen, but if no trump, play anything
  return true;
}

export class BeloteEngine extends GameEngine<BeloteState, BeloteMove, BeloteConfig> {
  readonly gameType = GameType.BELOTE;
  readonly minPlayers = 4;
  readonly maxPlayers = 4;

  private deckManager = new DeckManager();

  initialize(players: Player[], config: Partial<BeloteConfig> = {}): BeloteState {
    if (players.length !== 4) {
      throw new Error('Belote requires exactly 4 players');
    }

    const deck = this.deckManager.createDeck('french32');
    const shuffled = this.deckManager.shuffle(deck, config.seed);

    // Deal 8 cards each (32 / 4 = 8)
    const { hands: handArrays } = this.deckManager.deal(shuffled, 4, 8);
    const hands: Record<string, Card[]> = {};
    for (let i = 0; i < players.length; i++) {
      hands[players[i].id] = handArrays[i];
    }

    // Teams: players 0,2 vs players 1,3 (sitting across from each other)
    const teams: [string[], string[]] = [
      [players[0].id, players[2].id],
      [players[1].id, players[3].id],
    ];

    return {
      id: `belote-${Date.now()}`,
      type: GameType.BELOTE,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[1].id, // left of dealer starts bidding
      turnNumber: 0,
      phase: 'bidding',
      createdAt: Date.now(),
      hands,
      tricks: [],
      currentTrick: [],
      trumpSuit: null,
      contract: null,
      teams,
      teamScores: [0, 0],
      roundScores: [0, 0],
      dealerId: players[0].id,
      biddingHistory: [],
      beloteRebelote: null,
    };
  }

  validateMove(state: BeloteState, move: BeloteMove, playerId: string): ValidationResult {
    if (state.phase === 'bidding') {
      return this.validateBiddingMove(state, move, playerId);
    }

    if (state.phase === 'playing') {
      return this.validatePlayingMove(state, move, playerId);
    }

    return { valid: false, reason: `Cannot make moves in phase: ${state.phase}` };
  }

  private validateBiddingMove(
    state: BeloteState,
    move: BeloteMove,
    playerId: string
  ): ValidationResult {
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn to bid' };
    }

    if (move.type === 'pass') {
      return { valid: true };
    }

    if (move.type === 'bid') {
      const { value, trumpSuit } = move;
      if (value < 80 || value > 160 || value % 10 !== 0) {
        return { valid: false, reason: 'Bid must be between 80 and 160, in increments of 10' };
      }
      const validSuits = ['hearts', 'diamonds', 'clubs', 'spades'];
      if (!validSuits.includes(trumpSuit)) {
        return { valid: false, reason: 'Invalid trump suit' };
      }
      // Must be higher than current highest bid
      const highestBid = this.getHighestBid(state);
      if (highestBid && value <= highestBid) {
        return { valid: false, reason: `Bid must be higher than current bid of ${highestBid}` };
      }
      return { valid: true };
    }

    if (move.type === 'coinche') {
      // Can only coinche if opposing team has the current contract
      const highestBidEntry = this.getHighestBidEntry(state);
      if (!highestBidEntry) {
        return { valid: false, reason: 'No bid to coinche' };
      }
      const bidderTeam = getTeamIndex(highestBidEntry.playerId, state.teams);
      const myTeam = getTeamIndex(playerId, state.teams);
      if (bidderTeam === myTeam) {
        return { valid: false, reason: 'Cannot coinche your own team\'s bid' };
      }
      // Check if already coinched
      if (state.biddingHistory.some((b) => b.bid === 'coinche')) {
        return { valid: false, reason: 'Already coinched' };
      }
      return { valid: true };
    }

    if (move.type === 'surcoinche') {
      // Can only surcoinche after a coinche, and only by the coinched team
      if (!state.biddingHistory.some((b) => b.bid === 'coinche')) {
        return { valid: false, reason: 'No coinche to surcoinche' };
      }
      if (state.biddingHistory.some((b) => b.bid === 'surcoinche')) {
        return { valid: false, reason: 'Already surcoinched' };
      }
      const coincheEntry = state.biddingHistory.find((b) => b.bid === 'coinche')!;
      const coincheTeam = getTeamIndex(coincheEntry.playerId, state.teams);
      const myTeam = getTeamIndex(playerId, state.teams);
      if (coincheTeam === myTeam) {
        return { valid: false, reason: 'Cannot surcoinche the coinche from your own team' };
      }
      return { valid: true };
    }

    return { valid: false, reason: 'Invalid move type for bidding phase' };
  }

  private validatePlayingMove(
    state: BeloteState,
    move: BeloteMove,
    playerId: string
  ): ValidationResult {
    if (move.type === 'declareBelote') {
      // Can declare belote only if holding K+Q of trump
      if (!state.trumpSuit) {
        return { valid: false, reason: 'No trump suit set' };
      }
      if (state.beloteRebelote && state.beloteRebelote.declared) {
        return { valid: false, reason: 'Belote already declared' };
      }
      if (!hasBeloteRebelote(state.hands[playerId] || [], state.trumpSuit)) {
        return { valid: false, reason: 'You do not hold King and Queen of trump' };
      }
      return { valid: true };
    }

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

    const trumpSuit = state.trumpSuit!;

    // First card of trick: anything goes
    if (state.currentTrick.length === 0) {
      return { valid: true };
    }

    const ledSuit = state.currentTrick[0].card.suit;
    const hasSuit = hand.some((c) => c.suit === ledSuit);
    const hasTrump = hand.some((c) => c.suit === trumpSuit);

    // Must follow suit if possible
    if (hasSuit && card.suit !== ledSuit) {
      return { valid: false, reason: 'Must follow suit' };
    }

    // If following suit that is trump, must overtrump if possible
    if (card.suit === ledSuit && ledSuit === trumpSuit) {
      const highestTrumpPlayed = Math.max(
        ...state.currentTrick
          .filter((e) => e.card.suit === trumpSuit)
          .map((e) => TRUMP_ORDER[e.card.value] ?? 0)
      );
      const cardOrder = TRUMP_ORDER[card.value] ?? 0;
      const canOvertrump = hand.some(
        (c) =>
          c.suit === trumpSuit && (TRUMP_ORDER[c.value] ?? 0) > highestTrumpPlayed
      );
      if (canOvertrump && cardOrder <= highestTrumpPlayed) {
        return { valid: false, reason: 'Must overtrump when possible' };
      }
    }

    // Cannot follow suit
    if (!hasSuit) {
      // Determine if partner is currently winning the trick
      const currentWinnerId =
        state.currentTrick.length > 0
          ? determineTrickWinner(state.currentTrick, trumpSuit)
          : null;
      const myTeam = getTeamIndex(playerId, state.teams);
      const partnerIsWinning =
        currentWinnerId !== null && getTeamIndex(currentWinnerId, state.teams) === myTeam;

      if (!partnerIsWinning && hasTrump && card.suit !== trumpSuit) {
        return { valid: false, reason: 'Must play trump when you cannot follow suit and partner is not winning' };
      }

      // If playing trump, must overtrump if possible
      if (card.suit === trumpSuit) {
        const highestTrumpPlayed = Math.max(
          0,
          ...state.currentTrick
            .filter((e) => e.card.suit === trumpSuit)
            .map((e) => TRUMP_ORDER[e.card.value] ?? 0)
        );
        const cardOrder = TRUMP_ORDER[card.value] ?? 0;
        const canOvertrump = hand.some(
          (c) =>
            c.suit === trumpSuit && (TRUMP_ORDER[c.value] ?? 0) > highestTrumpPlayed
        );
        if (canOvertrump && cardOrder <= highestTrumpPlayed) {
          return { valid: false, reason: 'Must overtrump when possible' };
        }
      }
    }

    return { valid: true };
  }

  applyMove(
    state: BeloteState,
    move: BeloteMove,
    playerId: string
  ): { state: BeloteState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    if (state.phase === 'bidding') {
      return this.applyBiddingMove(newState, move, playerId, events);
    }

    if (state.phase === 'playing') {
      return this.applyPlayingMove(newState, move, playerId, events);
    }

    return { state: newState, events };
  }

  private applyBiddingMove(
    state: BeloteState,
    move: BeloteMove,
    playerId: string,
    events: GameEvent[]
  ): { state: BeloteState; events: GameEvent[] } {
    if (move.type === 'bid') {
      state.biddingHistory.push({
        playerId,
        bid: move.value,
        trumpSuit: move.trumpSuit,
      });
      events.push({
        type: 'bidPlaced',
        playerId,
        payload: { value: move.value, trumpSuit: move.trumpSuit },
        timestamp: Date.now(),
      });
    } else if (move.type === 'pass') {
      state.biddingHistory.push({ playerId, bid: 'pass' });
      events.push({
        type: 'bidPassed',
        playerId,
        payload: {},
        timestamp: Date.now(),
      });
    } else if (move.type === 'coinche') {
      state.biddingHistory.push({ playerId, bid: 'coinche' });
      events.push({
        type: 'coinche',
        playerId,
        payload: {},
        timestamp: Date.now(),
      });
    } else if (move.type === 'surcoinche') {
      state.biddingHistory.push({ playerId, bid: 'surcoinche' });
      events.push({
        type: 'surcoinche',
        playerId,
        payload: {},
        timestamp: Date.now(),
      });
    }

    // Check if bidding is over
    const biddingOver = this.isBiddingOver(state);

    if (biddingOver) {
      const highestBidEntry = this.getHighestBidEntry(state);

      if (!highestBidEntry) {
        // All passed - redeal
        events.push({
          type: 'allPassed',
          payload: { reason: 'No bids were made' },
          timestamp: Date.now(),
        });
        // Reinitialize with next dealer - for now just mark ended
        state.phase = 'ended';
        state.status = GameStatus.FINISHED;
        return { state, events };
      }

      // Find the actual bid entry with value and trumpSuit
      const bidEntry = state.biddingHistory.find(
        (b) => typeof b.bid === 'number' && b.playerId === highestBidEntry.playerId
      );
      // Get the last numeric bid from this player
      const allBids = state.biddingHistory.filter(
        (b) => typeof b.bid === 'number'
      );
      const lastBid = allBids[allBids.length - 1];
      const trumpSuit = this.getTrumpSuitFromBidHistory(state);

      state.contract = {
        team: getTeamIndex(lastBid.playerId, state.teams),
        value: lastBid.bid as number,
        trumpSuit,
        coinched: state.biddingHistory.some((b) => b.bid === 'coinche'),
        surcoinched: state.biddingHistory.some((b) => b.bid === 'surcoinche'),
      };
      state.trumpSuit = trumpSuit;
      state.phase = 'playing';

      // Player left of dealer leads first trick
      const dealerIdx = state.players.findIndex((p) => p.id === state.dealerId);
      state.currentPlayerId = state.players[(dealerIdx + 1) % 4].id;

      events.push({
        type: 'biddingComplete',
        payload: { contract: state.contract },
        timestamp: Date.now(),
      });

      // Check for belote-rebelote possibility
      for (const player of state.players) {
        if (hasBeloteRebelote(state.hands[player.id], trumpSuit)) {
          state.beloteRebelote = { playerId: player.id, declared: false };
          break;
        }
      }

      return { state, events };
    }

    // Advance to next bidder
    const currentIdx = state.players.findIndex((p) => p.id === playerId);
    state.currentPlayerId = state.players[(currentIdx + 1) % 4].id;

    return { state, events };
  }

  private applyPlayingMove(
    state: BeloteState,
    move: BeloteMove,
    playerId: string,
    events: GameEvent[]
  ): { state: BeloteState; events: GameEvent[] } {
    if (move.type === 'declareBelote') {
      state.beloteRebelote = { playerId, declared: true };
      events.push({
        type: 'beloteDeclared',
        playerId,
        payload: {},
        timestamp: Date.now(),
      });
      return { state, events };
    }

    if (move.type !== 'playCard') {
      return { state, events };
    }

    const hand = state.hands[playerId];
    const cardIdx = hand.findIndex((c) => c.id === move.cardId);
    const card = hand.splice(cardIdx, 1)[0];

    state.currentTrick.push({ playerId, card });

    events.push({
      type: 'cardPlayed',
      playerId,
      payload: { card },
      timestamp: Date.now(),
    });

    // Check if trick is complete (4 cards played)
    if (state.currentTrick.length === 4) {
      const winnerId = determineTrickWinner(state.currentTrick, state.trumpSuit!);

      // Calculate trick points
      let trickPoints = 0;
      for (const entry of state.currentTrick) {
        trickPoints += getCardPoints(entry.card, state.trumpSuit!);
      }

      const completedTrick: Trick = {
        cards: [...state.currentTrick],
        winnerId,
      };
      state.tricks.push(completedTrick);

      // Add points to winning team
      const winningTeam = getTeamIndex(winnerId, state.teams);
      state.roundScores[winningTeam] += trickPoints;

      events.push({
        type: 'trickComplete',
        playerId: winnerId,
        payload: { trickPoints, winnerId, trick: completedTrick },
        timestamp: Date.now(),
      });

      state.currentTrick = [];
      state.turnNumber++;

      // Check if all tricks played (8 tricks for 32 cards / 4 players)
      if (state.tricks.length === 8) {
        // Dix de der: last trick bonus = +10
        state.roundScores[winningTeam] += 10;

        events.push({
          type: 'dixDeDer',
          playerId: winnerId,
          payload: { team: winningTeam, bonus: 10 },
          timestamp: Date.now(),
        });

        // Belote-Rebelote bonus
        if (state.beloteRebelote && state.beloteRebelote.declared) {
          const beloteTeam = getTeamIndex(state.beloteRebelote.playerId, state.teams);
          state.roundScores[beloteTeam] += 20;
          events.push({
            type: 'beloteRebeloteBonus',
            playerId: state.beloteRebelote.playerId,
            payload: { team: beloteTeam, bonus: 20 },
            timestamp: Date.now(),
          });
        }

        // Check for capot (one team won all tricks)
        const team0Tricks = state.tricks.filter(
          (t) => getTeamIndex(t.winnerId, state.teams) === 0
        ).length;
        const team1Tricks = state.tricks.filter(
          (t) => getTeamIndex(t.winnerId, state.teams) === 1
        ).length;

        if (team0Tricks === 8) {
          state.roundScores[0] = 250;
          state.roundScores[1] = 0;
          events.push({
            type: 'capot',
            payload: { team: 0 },
            timestamp: Date.now(),
          });
        } else if (team1Tricks === 8) {
          state.roundScores[1] = 250;
          state.roundScores[0] = 0;
          events.push({
            type: 'capot',
            payload: { team: 1 },
            timestamp: Date.now(),
          });
        }

        // Score the round based on contract
        this.scoreRound(state, events);

        return { state, events };
      }

      // Winner leads next trick
      state.currentPlayerId = winnerId;
    } else {
      // Next player in clockwise order
      const currentIdx = state.players.findIndex((p) => p.id === playerId);
      state.currentPlayerId = state.players[(currentIdx + 1) % 4].id;
    }

    return { state, events };
  }

  private scoreRound(state: BeloteState, events: GameEvent[]): void {
    const contract = state.contract!;
    const contractTeam = contract.team;
    const defenseTeam = contractTeam === 0 ? 1 : 0;

    const contractPoints = state.roundScores[contractTeam];
    const contractMet = contractPoints >= contract.value;

    let multiplier = 1;
    if (contract.coinched) multiplier = 2;
    if (contract.surcoinched) multiplier = 4;

    if (contractMet) {
      // Contract team scores their points
      state.teamScores[contractTeam] += state.roundScores[contractTeam] * multiplier;
      state.teamScores[defenseTeam] += state.roundScores[defenseTeam] * multiplier;
    } else {
      // Contract failed: defense scores all points (162 total in game + bonuses)
      const totalPoints =
        state.roundScores[0] + state.roundScores[1];
      state.teamScores[defenseTeam] += totalPoints * multiplier;
      // Contract team scores 0
    }

    events.push({
      type: 'roundScored',
      payload: {
        contractMet,
        contractTeam,
        roundScores: [...state.roundScores],
        teamScores: [...state.teamScores],
        multiplier,
      },
      timestamp: Date.now(),
    });

    // For simplicity, end after one round (a full game would loop rounds)
    state.phase = 'ended';
    state.status = GameStatus.FINISHED;

    events.push({
      type: 'gameOver',
      payload: {
        teamScores: [...state.teamScores],
        winner: state.teamScores[0] > state.teamScores[1] ? 0 : 1,
      },
      timestamp: Date.now(),
    });
  }

  calculateScore(state: BeloteState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      const teamIdx = getTeamIndex(player.id, state.teams);
      scores.set(player.id, state.teamScores[teamIdx]);
    }
    return scores;
  }

  isGameOver(state: BeloteState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: BeloteState): string | null {
    if (state.phase !== 'ended') return null;
    // Return first player of winning team
    const winningTeam = state.teamScores[0] >= state.teamScores[1] ? 0 : 1;
    return state.teams[winningTeam][0];
  }

  getValidMoves(state: BeloteState, playerId: string): BeloteMove[] {
    const moves: BeloteMove[] = [];

    if (state.phase === 'bidding' && playerId === state.currentPlayerId) {
      moves.push({ type: 'pass' });

      const highestBid = this.getHighestBid(state);
      const minBid = highestBid ? highestBid + 10 : 80;

      for (let value = minBid; value <= 160; value += 10) {
        for (const suit of ['hearts', 'diamonds', 'clubs', 'spades']) {
          moves.push({ type: 'bid', value, trumpSuit: suit });
        }
      }

      // Coinche / Surcoinche
      const highestBidEntry = this.getHighestBidEntry(state);
      if (highestBidEntry) {
        const bidderTeam = getTeamIndex(highestBidEntry.playerId, state.teams);
        const myTeam = getTeamIndex(playerId, state.teams);
        if (
          bidderTeam !== myTeam &&
          !state.biddingHistory.some((b) => b.bid === 'coinche')
        ) {
          moves.push({ type: 'coinche' });
        }
      }
      if (state.biddingHistory.some((b) => b.bid === 'coinche')) {
        const coincheEntry = state.biddingHistory.find((b) => b.bid === 'coinche')!;
        const coincheTeam = getTeamIndex(coincheEntry.playerId, state.teams);
        const myTeam = getTeamIndex(playerId, state.teams);
        if (
          coincheTeam !== myTeam &&
          !state.biddingHistory.some((b) => b.bid === 'surcoinche')
        ) {
          moves.push({ type: 'surcoinche' });
        }
      }
    }

    if (state.phase === 'playing') {
      // Declare belote if possible
      if (
        state.beloteRebelote &&
        !state.beloteRebelote.declared &&
        state.beloteRebelote.playerId === playerId
      ) {
        moves.push({ type: 'declareBelote' });
      }

      if (playerId === state.currentPlayerId) {
        const hand = state.hands[playerId] || [];
        for (const card of hand) {
          const testMove: BeloteMove = { type: 'playCard', cardId: card.id };
          const validation = this.validatePlayingMove(state, testMove, playerId);
          if (validation.valid) {
            moves.push(testMove);
          }
        }
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: BeloteState): string {
    return state.currentPlayerId;
  }

  // --- Bidding helpers ---

  private getHighestBid(state: BeloteState): number | null {
    const numericBids = state.biddingHistory.filter(
      (b) => typeof b.bid === 'number'
    ) as { playerId: string; bid: number }[];
    if (numericBids.length === 0) return null;
    return Math.max(...numericBids.map((b) => b.bid));
  }

  private getHighestBidEntry(
    state: BeloteState
  ): { playerId: string; bid: number } | null {
    const numericBids = state.biddingHistory.filter(
      (b) => typeof b.bid === 'number'
    ) as { playerId: string; bid: number }[];
    if (numericBids.length === 0) return null;
    return numericBids.reduce((max, b) => (b.bid > max.bid ? b : max));
  }

  private getTrumpSuitFromBidHistory(state: BeloteState): string {
    // Find the last numeric bid entry which carries trumpSuit
    const numericBids = state.biddingHistory.filter(
      (b) => typeof b.bid === 'number' && b.trumpSuit
    );
    if (numericBids.length === 0) return 'spades';
    // Return the trump suit from the highest bid
    const highest = numericBids.reduce((max, b) =>
      (b.bid as number) > (max.bid as number) ? b : max
    );
    return highest.trumpSuit!;
  }

  private isBiddingOver(state: BeloteState): boolean {
    const history = state.biddingHistory;
    if (history.length < 4) return false;

    // All 4 passed with no bids
    if (
      history.length >= 4 &&
      history.every((b) => b.bid === 'pass')
    ) {
      return true;
    }

    // After a coinche or surcoinche, bidding ends
    if (history.some((b) => b.bid === 'surcoinche')) return true;

    // After a coinche, bidding ends (unless surcoinche possible, but
    // for simplicity we end on coinche too)
    if (history.some((b) => b.bid === 'coinche')) {
      // Give the coinched team a chance to surcoinche
      const lastEntry = history[history.length - 1];
      if (lastEntry.bid === 'coinche') return false; // wait for potential surcoinche
      if (lastEntry.bid === 'pass') {
        // Check if the last 2 entries after coinche are passes
        const coincheIdx = history.findIndex((b) => b.bid === 'coinche');
        const afterCoinche = history.slice(coincheIdx + 1);
        if (afterCoinche.length >= 1 && afterCoinche.every((b) => b.bid === 'pass')) {
          return true;
        }
      }
      return false;
    }

    // 3 consecutive passes after a bid
    const lastThree = history.slice(-3);
    if (lastThree.length === 3 && lastThree.every((b) => b.bid === 'pass')) {
      // Make sure there was at least one real bid before
      const hasBid = history.some((b) => typeof b.bid === 'number');
      if (hasBid) return true;
    }

    return false;
  }
}
