import { Card, GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  PokerState,
  PokerMove,
  PokerConfig,
  PokerPlayer,
  PokerPlayerState,
  SidePot,
  HandRank,
  HandEvaluation,
} from './poker.types';

// ─── Hand Evaluation ────────────────────────────────────────────────────

/**
 * Evaluate the best 5-card hand from any number of cards (typically 7).
 * Returns the hand rank and kickers for tiebreaking.
 */
export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length < 5) {
    return { rank: HandRank.HIGH_CARD, kickers: cards.map((c) => aceHighValue(c.value)).sort((a, b) => b - a), description: 'High Card' };
  }

  const combos = combinations5(cards);
  let best: HandEvaluation = { rank: HandRank.HIGH_CARD, kickers: [0], description: 'High Card' };

  for (const combo of combos) {
    const evaluation = evaluate5(combo);
    if (compareHands(evaluation, best) > 0) {
      best = evaluation;
    }
  }

  return best;
}

/** Convert card value to ace-high (Ace=14 instead of 1) */
function aceHighValue(value: number): number {
  return value === 1 ? 14 : value;
}

/** Evaluate exactly 5 cards */
function evaluate5(cards: Card[]): HandEvaluation {
  const values = cards.map((c) => aceHighValue(c.value)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check for straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count value frequencies
  const freqMap = new Map<number, number>();
  for (const v of values) {
    freqMap.set(v, (freqMap.get(v) || 0) + 1);
  }
  const freqs = Array.from(freqMap.entries()).sort((a, b) => {
    // Sort by frequency desc, then by value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const counts = freqs.map(([, count]) => count);
  const orderedValues = freqs.map(([value]) => value);

  // Royal Flush
  if (isFlush && isStraight && straightHigh === 14) {
    return { rank: HandRank.ROYAL_FLUSH, kickers: [14], description: 'Royal Flush' };
  }

  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: HandRank.STRAIGHT_FLUSH, kickers: [straightHigh], description: `Straight Flush, ${straightHigh} high` };
  }

  // Four of a Kind
  if (counts[0] === 4) {
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      kickers: orderedValues,
      description: `Four of a Kind, ${orderedValues[0]}s`,
    };
  }

  // Full House
  if (counts[0] === 3 && counts[1] === 2) {
    return {
      rank: HandRank.FULL_HOUSE,
      kickers: orderedValues,
      description: `Full House, ${orderedValues[0]}s full of ${orderedValues[1]}s`,
    };
  }

  // Flush
  if (isFlush) {
    return { rank: HandRank.FLUSH, kickers: values, description: `Flush, ${values[0]} high` };
  }

  // Straight
  if (isStraight) {
    return { rank: HandRank.STRAIGHT, kickers: [straightHigh], description: `Straight, ${straightHigh} high` };
  }

  // Three of a Kind
  if (counts[0] === 3) {
    return {
      rank: HandRank.THREE_OF_A_KIND,
      kickers: orderedValues,
      description: `Three of a Kind, ${orderedValues[0]}s`,
    };
  }

  // Two Pair
  if (counts[0] === 2 && counts[1] === 2) {
    return {
      rank: HandRank.TWO_PAIR,
      kickers: orderedValues,
      description: `Two Pair, ${orderedValues[0]}s and ${orderedValues[1]}s`,
    };
  }

  // One Pair
  if (counts[0] === 2) {
    return {
      rank: HandRank.ONE_PAIR,
      kickers: orderedValues,
      description: `Pair of ${orderedValues[0]}s`,
    };
  }

  // High Card
  return { rank: HandRank.HIGH_CARD, kickers: values, description: `High Card ${values[0]}` };
}

/** Compare two hand evaluations. Returns >0 if a wins, <0 if b wins, 0 if tie */
function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

/** Generate all 5-card combinations from an array of cards */
function combinations5(cards: Card[]): Card[][] {
  const results: Card[][] = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            results.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  return results;
}

// ─── Side Pot Calculation ───────────────────────────────────────────────

/**
 * Calculate side pots from the current betting state.
 * This handles all edge cases including multiple all-in players with different stacks.
 */
function calculateSidePots(
  playerStates: Record<string, PokerPlayerState>,
  playerIds: string[]
): SidePot[] {
  // Get all active players (not folded) and their total bets
  const activeBets: { playerId: string; totalBet: number }[] = [];
  for (const id of playerIds) {
    const ps = playerStates[id];
    if (ps.totalBet > 0) {
      activeBets.push({ playerId: id, totalBet: ps.totalBet });
    }
  }

  if (activeBets.length === 0) return [];

  // Sort by total bet ascending
  activeBets.sort((a, b) => a.totalBet - b.totalBet);

  const pots: SidePot[] = [];
  let previousLevel = 0;

  // Get unique bet levels
  const levels = [...new Set(activeBets.map((b) => b.totalBet))].sort((a, b) => a - b);

  for (const level of levels) {
    const increment = level - previousLevel;
    if (increment <= 0) continue;

    // All players who bet at least this level are eligible (unless folded)
    const eligible = activeBets
      .filter((b) => b.totalBet >= level)
      .map((b) => b.playerId)
      .filter((id) => !playerStates[id].folded);

    // Count how many players contributed at this level
    const contributors = activeBets.filter((b) => b.totalBet >= level).length;
    const potAmount = increment * contributors;

    if (eligible.length > 0 && potAmount > 0) {
      pots.push({ amount: potAmount, eligiblePlayers: eligible });
    }

    previousLevel = level;
  }

  // Merge pots with the same eligible players
  const merged: SidePot[] = [];
  for (const pot of pots) {
    const existing = merged.find(
      (m) =>
        m.eligiblePlayers.length === pot.eligiblePlayers.length &&
        m.eligiblePlayers.every((p) => pot.eligiblePlayers.includes(p))
    );
    if (existing) {
      existing.amount += pot.amount;
    } else {
      merged.push({ ...pot, eligiblePlayers: [...pot.eligiblePlayers] });
    }
  }

  return merged;
}

// ─── State Cloning ──────────────────────────────────────────────────────

function cloneState(state: PokerState): PokerState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    communityCards: state.communityCards.map((c) => ({ ...c })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    deck: state.deck.map((c) => ({ ...c })),
    sidePots: state.sidePots.map((p) => ({
      amount: p.amount,
      eligiblePlayers: [...p.eligiblePlayers],
    })),
    bets: { ...state.bets },
    playerStates: Object.fromEntries(
      Object.entries(state.playerStates).map(([k, v]) => [k, { ...v }])
    ),
  };
}

// ─── Engine ─────────────────────────────────────────────────────────────

export class PokerEngine extends GameEngine<PokerState, PokerMove, PokerConfig> {
  readonly gameType = GameType.POKER;
  readonly minPlayers = 2;
  readonly maxPlayers = 9;

  private deckManager = new DeckManager();

  initialize(players: Player[], config: Partial<PokerConfig> = {}): PokerState {
    if (players.length < this.minPlayers || players.length > this.maxPlayers) {
      throw new Error(`Poker requires ${this.minPlayers}-${this.maxPlayers} players`);
    }

    const smallBlind = config.smallBlind ?? 10;
    const bigBlind = config.bigBlind ?? 20;
    const startingChips = config.startingChips ?? 1000;

    const pokerPlayers: PokerPlayer[] = players.map((p) => ({
      ...p,
      chips: startingChips,
    }));

    const deck = this.deckManager.createDeck('french52');
    const shuffled = this.deckManager.shuffle(deck, config.seed);

    // Deal 2 hole cards each
    const hands: Record<string, Card[]> = {};
    let cardIdx = 0;
    for (const p of pokerPlayers) {
      hands[p.id] = [shuffled[cardIdx++], shuffled[cardIdx++]];
    }
    const remainingDeck = shuffled.slice(cardIdx);

    // Set up player states
    const playerStates: Record<string, PokerPlayerState> = {};
    for (const p of pokerPlayers) {
      playerStates[p.id] = {
        chips: startingChips,
        totalBet: 0,
        folded: false,
        allIn: false,
      };
    }

    // Post blinds
    const dealerIndex = 0;
    const n = pokerPlayers.length;
    const sbIndex = n === 2 ? dealerIndex : (dealerIndex + 1) % n;
    const bbIndex = n === 2 ? (dealerIndex + 1) % n : (dealerIndex + 2) % n;

    const sbPlayer = pokerPlayers[sbIndex];
    const bbPlayer = pokerPlayers[bbIndex];

    const sbAmount = Math.min(smallBlind, playerStates[sbPlayer.id].chips);
    playerStates[sbPlayer.id].chips -= sbAmount;
    playerStates[sbPlayer.id].totalBet = sbAmount;

    const bbAmount = Math.min(bigBlind, playerStates[bbPlayer.id].chips);
    playerStates[bbPlayer.id].chips -= bbAmount;
    playerStates[bbPlayer.id].totalBet = bbAmount;

    if (playerStates[sbPlayer.id].chips === 0) playerStates[sbPlayer.id].allIn = true;
    if (playerStates[bbPlayer.id].chips === 0) playerStates[bbPlayer.id].allIn = true;

    const bets: Record<string, number> = {};
    for (const p of pokerPlayers) {
      bets[p.id] = 0;
    }
    bets[sbPlayer.id] = sbAmount;
    bets[bbPlayer.id] = bbAmount;

    // First to act preflop: left of big blind (or small blind in heads-up)
    const firstActIndex = n === 2 ? dealerIndex : (bbIndex + 1) % n;

    return {
      id: `poker-${Date.now()}`,
      type: GameType.POKER,
      status: GameStatus.IN_PROGRESS,
      players: pokerPlayers,
      currentPlayerId: pokerPlayers[firstActIndex].id,
      turnNumber: 0,
      phase: 'preflop',
      createdAt: Date.now(),
      communityCards: [],
      hands,
      deck: remainingDeck,
      pot: sbAmount + bbAmount,
      sidePots: [],
      currentBet: bbAmount,
      bets,
      dealerIndex,
      smallBlind,
      bigBlind,
      playerStates,
      lastRaiser: bbPlayer.id,
      minRaise: bigBlind,
      actionCount: 0,
    };
  }

  validateMove(state: PokerState, move: PokerMove, playerId: string): ValidationResult {
    if (state.phase === 'ended' || state.phase === 'showdown' || state.phase === 'waiting') {
      return { valid: false, reason: 'Cannot make moves in current phase' };
    }

    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    const ps = state.playerStates[playerId];
    if (!ps) return { valid: false, reason: 'Player not found' };
    if (ps.folded) return { valid: false, reason: 'You have folded' };
    if (ps.allIn) return { valid: false, reason: 'You are all-in' };

    const playerBet = state.bets[playerId] || 0;
    const toCall = state.currentBet - playerBet;

    switch (move.type) {
      case 'fold':
        return { valid: true };

      case 'check':
        if (toCall > 0) {
          return { valid: false, reason: 'Cannot check when there is a bet to call' };
        }
        return { valid: true };

      case 'call':
        if (toCall <= 0) {
          return { valid: false, reason: 'Nothing to call' };
        }
        return { valid: true };

      case 'raise': {
        const raiseTotal = move.amount; // Total bet amount after raise
        const currentPlayerBet = playerBet;
        const raiseBy = raiseTotal - state.currentBet;

        if (raiseTotal <= state.currentBet) {
          return { valid: false, reason: 'Raise must be greater than current bet' };
        }
        if (raiseBy < state.minRaise && raiseTotal < ps.chips + currentPlayerBet) {
          // Allow if it's an all-in situation
          return { valid: false, reason: `Minimum raise is ${state.minRaise}` };
        }
        const costToRaise = raiseTotal - currentPlayerBet;
        if (costToRaise > ps.chips) {
          return { valid: false, reason: 'Not enough chips for this raise' };
        }
        return { valid: true };
      }

      case 'allIn':
        if (ps.chips <= 0) {
          return { valid: false, reason: 'No chips to go all-in with' };
        }
        return { valid: true };

      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: PokerState,
    move: PokerMove,
    playerId: string
  ): { state: PokerState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];
    const ps = newState.playerStates[playerId];
    const playerBet = newState.bets[playerId] || 0;

    switch (move.type) {
      case 'fold': {
        ps.folded = true;
        events.push({
          type: 'playerFolded',
          playerId,
          payload: {},
          timestamp: Date.now(),
        });
        break;
      }

      case 'check': {
        events.push({
          type: 'playerChecked',
          playerId,
          payload: {},
          timestamp: Date.now(),
        });
        break;
      }

      case 'call': {
        const toCall = Math.min(newState.currentBet - playerBet, ps.chips);
        ps.chips -= toCall;
        newState.bets[playerId] = playerBet + toCall;
        ps.totalBet += toCall;
        newState.pot += toCall;

        if (ps.chips === 0) {
          ps.allIn = true;
        }

        events.push({
          type: 'playerCalled',
          playerId,
          payload: { amount: toCall },
          timestamp: Date.now(),
        });
        break;
      }

      case 'raise': {
        const raiseTotal = move.amount;
        const cost = raiseTotal - playerBet;
        const raiseBy = raiseTotal - newState.currentBet;

        ps.chips -= cost;
        newState.bets[playerId] = raiseTotal;
        ps.totalBet += cost;
        newState.pot += cost;
        newState.currentBet = raiseTotal;
        newState.lastRaiser = playerId;
        newState.minRaise = Math.max(newState.minRaise, raiseBy);
        newState.actionCount = 0; // Reset action count on raise

        if (ps.chips === 0) {
          ps.allIn = true;
        }

        events.push({
          type: 'playerRaised',
          playerId,
          payload: { amount: raiseTotal, raiseBy },
          timestamp: Date.now(),
        });
        break;
      }

      case 'allIn': {
        const allInAmount = ps.chips;
        const newBet = playerBet + allInAmount;
        ps.chips = 0;
        ps.allIn = true;
        newState.bets[playerId] = newBet;
        ps.totalBet += allInAmount;
        newState.pot += allInAmount;

        if (newBet > newState.currentBet) {
          const raiseBy = newBet - newState.currentBet;
          newState.currentBet = newBet;
          newState.lastRaiser = playerId;
          if (raiseBy >= newState.minRaise) {
            newState.minRaise = raiseBy;
          }
          newState.actionCount = 0;
        }

        events.push({
          type: 'playerAllIn',
          playerId,
          payload: { amount: allInAmount, totalBet: newBet },
          timestamp: Date.now(),
        });
        break;
      }
    }

    newState.actionCount++;
    newState.turnNumber++;

    // Check if only one player remains (everyone else folded)
    const activePlayers = newState.players.filter(
      (p) => !newState.playerStates[p.id].folded
    );

    if (activePlayers.length === 1) {
      // Immediate win
      const winnerId = activePlayers[0].id;
      newState.playerStates[winnerId].chips += newState.pot;
      newState.pot = 0;

      newState.phase = 'ended';
      newState.status = GameStatus.FINISHED;

      events.push({
        type: 'handWon',
        playerId: winnerId,
        payload: { reason: 'allFolded', pot: newState.pot },
        timestamp: Date.now(),
      });

      return { state: newState, events };
    }

    // Advance to next player or next phase
    if (this.isBettingRoundComplete(newState)) {
      this.advancePhase(newState, events);
    } else {
      this.advanceToNextPlayer(newState);
    }

    return { state: newState, events };
  }

  private isBettingRoundComplete(state: PokerState): boolean {
    const activePlayers = state.players.filter(
      (p) => !state.playerStates[p.id].folded && !state.playerStates[p.id].allIn
    );

    // If no active players (all folded or all-in), round is complete
    if (activePlayers.length === 0) return true;

    // If only one active player (others all-in or folded), round is complete
    if (activePlayers.length === 1) {
      const pid = activePlayers[0].id;
      const bet = state.bets[pid] || 0;
      // If this player matches the current bet, round is complete
      if (bet >= state.currentBet) return true;
      // If they haven't acted yet, not complete
      return false;
    }

    // All active players must have matched the current bet
    for (const p of activePlayers) {
      const bet = state.bets[p.id] || 0;
      if (bet < state.currentBet) return false;
    }

    // Ensure everyone has had a chance to act
    // The action count must be >= number of active players
    if (state.actionCount < activePlayers.length) return false;

    return true;
  }

  private advanceToNextPlayer(state: PokerState): void {
    const n = state.players.length;
    let idx = state.players.findIndex((p) => p.id === state.currentPlayerId);

    for (let i = 0; i < n; i++) {
      idx = (idx + 1) % n;
      const p = state.players[idx];
      const ps = state.playerStates[p.id];
      if (!ps.folded && !ps.allIn) {
        state.currentPlayerId = p.id;
        return;
      }
    }

    // If no one can act (shouldn't happen given prior checks), keep current
  }

  private advancePhase(state: PokerState, events: GameEvent[]): void {
    // Reset betting for new round
    for (const p of state.players) {
      state.bets[p.id] = 0;
    }
    state.currentBet = 0;
    state.lastRaiser = null;
    state.minRaise = state.bigBlind;
    state.actionCount = 0;

    // Calculate side pots
    state.sidePots = calculateSidePots(
      state.playerStates,
      state.players.map((p) => p.id)
    );

    const activeNonAllIn = state.players.filter(
      (p) => !state.playerStates[p.id].folded && !state.playerStates[p.id].allIn
    );

    // If all remaining players are all-in (or only 1 can act), run out community cards
    const needsRunout = activeNonAllIn.length <= 1;

    switch (state.phase) {
      case 'preflop': {
        // Burn one, then deal 3 community cards (flop)
        state.deck.shift(); // burn
        state.communityCards.push(state.deck.shift()!);
        state.communityCards.push(state.deck.shift()!);
        state.communityCards.push(state.deck.shift()!);

        state.phase = 'flop';
        events.push({
          type: 'flopDealt',
          payload: { cards: state.communityCards.slice(0, 3) },
          timestamp: Date.now(),
        });

        if (needsRunout) {
          this.advancePhase(state, events);
          return;
        }
        break;
      }

      case 'flop': {
        state.deck.shift(); // burn
        state.communityCards.push(state.deck.shift()!);
        state.phase = 'turn';
        events.push({
          type: 'turnDealt',
          payload: { card: state.communityCards[3] },
          timestamp: Date.now(),
        });

        if (needsRunout) {
          this.advancePhase(state, events);
          return;
        }
        break;
      }

      case 'turn': {
        state.deck.shift(); // burn
        state.communityCards.push(state.deck.shift()!);
        state.phase = 'river';
        events.push({
          type: 'riverDealt',
          payload: { card: state.communityCards[4] },
          timestamp: Date.now(),
        });

        if (needsRunout) {
          this.advancePhase(state, events);
          return;
        }
        break;
      }

      case 'river': {
        // Showdown
        this.resolveShowdown(state, events);
        return;
      }
    }

    // Set first to act: first active player left of dealer
    this.setFirstToAct(state);
  }

  private setFirstToAct(state: PokerState): void {
    const n = state.players.length;
    // Post-flop: first active player left of dealer
    for (let i = 1; i <= n; i++) {
      const idx = (state.dealerIndex + i) % n;
      const p = state.players[idx];
      const ps = state.playerStates[p.id];
      if (!ps.folded && !ps.allIn) {
        state.currentPlayerId = p.id;
        return;
      }
    }
  }

  private resolveShowdown(state: PokerState, events: GameEvent[]): void {
    state.phase = 'showdown';

    // Recalculate side pots from total bets
    const pots = calculateSidePots(
      state.playerStates,
      state.players.map((p) => p.id)
    );

    // If no side pots calculated, create a single main pot
    if (pots.length === 0) {
      const eligible = state.players
        .filter((p) => !state.playerStates[p.id].folded)
        .map((p) => p.id);
      pots.push({ amount: state.pot, eligiblePlayers: eligible });
    }

    // Evaluate hands
    const handEvals: Record<string, HandEvaluation> = {};
    for (const p of state.players) {
      if (state.playerStates[p.id].folded) continue;
      const allCards = [...(state.hands[p.id] || []), ...state.communityCards];
      handEvals[p.id] = evaluateHand(allCards);
    }

    const showdownResults: { playerId: string; hand: HandEvaluation }[] = [];
    for (const [pid, eval_] of Object.entries(handEvals)) {
      showdownResults.push({ playerId: pid, hand: eval_ });
    }

    events.push({
      type: 'showdown',
      payload: { hands: showdownResults },
      timestamp: Date.now(),
    });

    // Award each pot
    let totalAwarded = 0;
    for (const pot of pots) {
      // Find the best hand among eligible players
      let bestPlayers: string[] = [];
      let bestHand: HandEvaluation | null = null;

      for (const pid of pot.eligiblePlayers) {
        const eval_ = handEvals[pid];
        if (!eval_) continue;

        if (!bestHand) {
          bestHand = eval_;
          bestPlayers = [pid];
        } else {
          const cmp = compareHands(eval_, bestHand);
          if (cmp > 0) {
            bestHand = eval_;
            bestPlayers = [pid];
          } else if (cmp === 0) {
            bestPlayers.push(pid);
          }
        }
      }

      if (bestPlayers.length > 0) {
        const share = Math.floor(pot.amount / bestPlayers.length);
        const remainder = pot.amount - share * bestPlayers.length;

        for (let i = 0; i < bestPlayers.length; i++) {
          const amount = share + (i === 0 ? remainder : 0);
          state.playerStates[bestPlayers[i]].chips += amount;
          totalAwarded += amount;
        }

        events.push({
          type: 'potAwarded',
          payload: {
            potAmount: pot.amount,
            winners: bestPlayers,
            hand: bestHand?.description,
          },
          timestamp: Date.now(),
        });
      }
    }

    // Update player chip counts on player objects
    for (const p of state.players) {
      (p as PokerPlayer).chips = state.playerStates[p.id].chips;
    }

    state.pot = 0;
    state.phase = 'ended';
    state.status = GameStatus.FINISHED;

    events.push({
      type: 'gameOver',
      payload: {
        playerChips: Object.fromEntries(
          state.players.map((p) => [p.id, state.playerStates[p.id].chips])
        ),
      },
      timestamp: Date.now(),
    });
  }

  calculateScore(state: PokerState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const p of state.players) {
      scores.set(p.id, state.playerStates[p.id].chips);
    }
    return scores;
  }

  isGameOver(state: PokerState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: PokerState): string | null {
    if (state.phase !== 'ended') return null;
    let maxChips = -1;
    let winnerId: string | null = null;
    for (const p of state.players) {
      const chips = state.playerStates[p.id].chips;
      if (chips > maxChips) {
        maxChips = chips;
        winnerId = p.id;
      }
    }
    return winnerId;
  }

  getValidMoves(state: PokerState, playerId: string): PokerMove[] {
    if (playerId !== state.currentPlayerId) return [];
    if (state.phase === 'ended' || state.phase === 'showdown' || state.phase === 'waiting') {
      return [];
    }

    const ps = state.playerStates[playerId];
    if (!ps || ps.folded || ps.allIn) return [];

    const moves: PokerMove[] = [];
    const playerBet = state.bets[playerId] || 0;
    const toCall = state.currentBet - playerBet;

    // Always can fold
    moves.push({ type: 'fold' });

    if (toCall <= 0) {
      // Can check
      moves.push({ type: 'check' });
    } else {
      // Can call
      moves.push({ type: 'call' });
    }

    // Can raise if have enough chips
    const minRaiseTotal = state.currentBet + state.minRaise;
    const costToMinRaise = minRaiseTotal - playerBet;
    if (costToMinRaise <= ps.chips && costToMinRaise > 0) {
      moves.push({ type: 'raise', amount: minRaiseTotal });
    }

    // Can always go all-in if have chips
    if (ps.chips > 0) {
      moves.push({ type: 'allIn' });
    }

    return moves;
  }

  getCurrentPlayerId(state: PokerState): string {
    return state.currentPlayerId;
  }
}
