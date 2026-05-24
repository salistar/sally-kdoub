import { Player, GameType, GameStatus } from '@sally/types';
import { PokerEngine } from '../poker.engine';
import { PokerState, PokerMove, HandRank } from '../poker.types';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    username: `Player ${i + 1}`,
    avatar: '',
    score: 0,
    isBot: false,
    isConnected: true,
    isReady: true,
  }));
}

describe('PokerEngine', () => {
  let engine: PokerEngine;
  const seed = 12345;

  beforeEach(() => {
    engine = new PokerEngine();
  });

  // --- Initialization ---

  it('should initialize with correct blind posting', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, {
      smallBlind: 10,
      bigBlind: 20,
      startingChips: 1000,
      seed,
    });

    expect(state.phase).toBe('preflop');
    expect(state.pot).toBe(30); // SB + BB
    expect(state.smallBlind).toBe(10);
    expect(state.bigBlind).toBe(20);

    // SB is player at index 1, BB at index 2 (3-player)
    const sbId = players[1].id;
    const bbId = players[2].id;
    expect(state.playerStates[sbId].chips).toBe(990);
    expect(state.playerStates[bbId].chips).toBe(980);
  });

  it('should deal 2 hole cards to each player', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    for (const p of players) {
      expect(state.hands[p.id].length).toBe(2);
    }
  });

  it('should handle heads-up blind posting correctly', () => {
    const players = makePlayers(2);
    const state = engine.initialize(players, {
      smallBlind: 5,
      bigBlind: 10,
      seed,
    });

    // In heads-up: dealer posts SB, other posts BB
    expect(state.pot).toBe(15);
    // First to act preflop in heads-up is the dealer (SB position)
    expect(state.currentPlayerId).toBe(players[0].id);
  });

  // --- Fold ---

  it('should handle fold action', () => {
    const players = makePlayers(2);
    const state = engine.initialize(players, { seed });
    const pid = state.currentPlayerId;

    const { state: newState, events } = engine.applyMove(
      state,
      { type: 'fold' },
      pid
    );

    expect(newState.playerStates[pid].folded).toBe(true);
    expect(events.some((e) => e.type === 'playerFolded')).toBe(true);
    // Other player wins immediately
    expect(newState.phase).toBe('ended');
  });

  // --- Call ---

  it('should handle call action', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const pid = state.currentPlayerId;

    const validation = engine.validateMove(state, { type: 'call' }, pid);
    expect(validation.valid).toBe(true);

    const { state: newState, events } = engine.applyMove(
      state,
      { type: 'call' },
      pid
    );

    expect(events.some((e) => e.type === 'playerCalled')).toBe(true);
    expect(newState.pot).toBeGreaterThan(state.pot);
  });

  // --- Check ---

  it('should reject check when there is a bet to call', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const pid = state.currentPlayerId;
    const playerBet = state.bets[pid] || 0;

    if (state.currentBet > playerBet) {
      const result = engine.validateMove(state, { type: 'check' }, pid);
      expect(result.valid).toBe(false);
    }
  });

  // --- Raise ---

  it('should handle raise action', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
    });
    const pid = state.currentPlayerId;

    const raiseAmount = 40; // Raise to 40 (min raise of 20 on top of 20 BB)
    const move: PokerMove = { type: 'raise', amount: raiseAmount };
    const validation = engine.validateMove(state, move, pid);
    expect(validation.valid).toBe(true);

    const { state: newState, events } = engine.applyMove(state, move, pid);
    expect(newState.currentBet).toBe(raiseAmount);
    expect(events.some((e) => e.type === 'playerRaised')).toBe(true);
  });

  it('should reject raise below minimum raise', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
    });
    const pid = state.currentPlayerId;

    // Try to raise to 25 (only 5 above current bet of 20, min raise is 20)
    const move: PokerMove = { type: 'raise', amount: 25 };
    const result = engine.validateMove(state, move, pid);
    expect(result.valid).toBe(false);
  });

  // --- All-in ---

  it('should handle all-in with side pot', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
      startingChips: 100,
    });

    const pid = state.currentPlayerId;
    const validation = engine.validateMove(state, { type: 'allIn' }, pid);
    expect(validation.valid).toBe(true);

    const { state: newState, events } = engine.applyMove(
      state,
      { type: 'allIn' },
      pid
    );

    expect(newState.playerStates[pid].allIn).toBe(true);
    expect(newState.playerStates[pid].chips).toBe(0);
    expect(events.some((e) => e.type === 'playerAllIn')).toBe(true);
  });

  // --- Phase transitions ---

  it('should transition from preflop to flop after all players act', () => {
    const players = makePlayers(2);
    const state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
    });

    // Heads-up: dealer/SB acts first preflop
    let current = state;

    // Player 1 (dealer/SB) calls
    const { state: afterCall } = engine.applyMove(
      current,
      { type: 'call' },
      current.currentPlayerId
    );
    current = afterCall;

    // Player 2 (BB) checks
    if (current.phase === 'preflop') {
      const { state: afterCheck } = engine.applyMove(
        current,
        { type: 'check' },
        current.currentPlayerId
      );
      current = afterCheck;
    }

    // Should now be on the flop
    expect(current.phase).toBe('flop');
    expect(current.communityCards.length).toBe(3);
  });

  it('should transition through flop -> turn -> river', () => {
    const players = makePlayers(2);
    let state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
    });

    // Play through all betting rounds with checks/calls
    const playRound = (s: PokerState): PokerState => {
      let current = s;
      let safetyCounter = 0;
      const startPhase = current.phase;

      while (current.phase === startPhase && safetyCounter < 10) {
        safetyCounter++;
        const pid = current.currentPlayerId;
        const moves = engine.getValidMoves(current, pid);
        const checkMove = moves.find((m) => m.type === 'check');
        const callMove = moves.find((m) => m.type === 'call');
        const move = checkMove || callMove || moves[0];
        if (!move) break;
        const result = engine.applyMove(current, move, pid);
        current = result.state;
      }
      return current;
    };

    state = playRound(state); // preflop -> flop
    expect(['flop', 'showdown', 'ended']).toContain(state.phase);

    if (state.phase === 'flop') {
      state = playRound(state);
      expect(['turn', 'showdown', 'ended']).toContain(state.phase);
    }

    if (state.phase === 'turn') {
      expect(state.communityCards.length).toBe(4);
      state = playRound(state);
      expect(['river', 'showdown', 'ended']).toContain(state.phase);
    }

    if (state.phase === 'river') {
      expect(state.communityCards.length).toBe(5);
    }
  });

  // --- Showdown winner determination ---

  it('should determine winner at showdown', () => {
    const players = makePlayers(2);
    let state = engine.initialize(players, {
      seed,
      smallBlind: 10,
      bigBlind: 20,
    });

    // Play through to showdown
    let safetyCounter = 0;
    while (
      state.phase !== 'ended' &&
      state.phase !== 'showdown' &&
      safetyCounter < 50
    ) {
      safetyCounter++;
      const pid = state.currentPlayerId;
      const moves = engine.getValidMoves(state, pid);
      if (moves.length === 0) break;

      const checkMove = moves.find((m) => m.type === 'check');
      const callMove = moves.find((m) => m.type === 'call');
      const move = checkMove || callMove || moves[0];
      const result = engine.applyMove(state, move, pid);
      state = result.state;
    }

    expect(state.phase).toBe('ended');
    // One player should have gained chips
    const chips1 = state.playerStates[players[0].id].chips;
    const chips2 = state.playerStates[players[1].id].chips;
    expect(chips1 + chips2).toBe(2000); // chips are conserved
  });

  // --- Validation ---

  it('should reject moves when not your turn', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const notCurrentPlayer = players.find(
      (p) => p.id !== state.currentPlayerId
    )!;

    const result = engine.validateMove(
      state,
      { type: 'fold' },
      notCurrentPlayer.id
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Not your turn');
  });

  it('should reject moves from folded players', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const pid = state.currentPlayerId;

    // Fold
    const { state: afterFold } = engine.applyMove(
      state,
      { type: 'fold' },
      pid
    );

    // If this player became current again somehow, they can't act
    const modifiedState: PokerState = {
      ...afterFold,
      currentPlayerId: pid,
    };
    const result = engine.validateMove(modifiedState, { type: 'check' }, pid);
    expect(result.valid).toBe(false);
  });

  it('should reject moves in ended phase', () => {
    const players = makePlayers(2);
    const state = engine.initialize(players, { seed });
    const endedState: PokerState = { ...state, phase: 'ended' };

    const result = engine.validateMove(
      endedState,
      { type: 'fold' },
      state.currentPlayerId
    );
    expect(result.valid).toBe(false);
  });

  // --- getValidMoves ---

  it('should return valid moves for current player', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const pid = state.currentPlayerId;
    const moves = engine.getValidMoves(state, pid);

    // Should at minimum have fold and call/check
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.some((m) => m.type === 'fold')).toBe(true);
  });

  it('should return empty moves for non-current player', () => {
    const players = makePlayers(3);
    const state = engine.initialize(players, { seed });
    const other = players.find((p) => p.id !== state.currentPlayerId)!;
    expect(engine.getValidMoves(state, other.id)).toEqual([]);
  });

  // --- calculateScore / getWinner ---

  it('should calculate scores as chip counts', () => {
    const players = makePlayers(2);
    const state = engine.initialize(players, { seed });
    const scores = engine.calculateScore(state);
    for (const p of players) {
      expect(scores.get(p.id)).toBeDefined();
      expect(typeof scores.get(p.id)).toBe('number');
    }
  });
});
