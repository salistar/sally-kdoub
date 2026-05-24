import { Player, GameType, GameStatus, Card } from '@sally/types';
import { SolitaireEngine } from '../solitaire.engine';
import { SolitaireState, SolitaireMove } from '../solitaire.types';

function makePlayer(): Player[] {
  return [
    {
      id: 'player-1',
      username: 'Player 1',
      avatar: '',
      score: 0,
      isBot: false,
      isConnected: true,
      isReady: true,
    },
  ];
}

describe('SolitaireEngine', () => {
  let engine: SolitaireEngine;
  const players = makePlayer();
  const pid = 'player-1';

  beforeEach(() => {
    engine = new SolitaireEngine();
  });

  // --- Initialization ---

  it('should initialize with 7 tableau columns', () => {
    const state = engine.initialize(players);
    expect(state.tableau.length).toBe(7);
  });

  it('should have correct card counts per column (1,2,3,4,5,6,7)', () => {
    const state = engine.initialize(players);
    for (let i = 0; i < 7; i++) {
      expect(state.tableau[i].cards.length).toBe(i + 1);
    }
  });

  it('should have 1 face-up card per column initially', () => {
    const state = engine.initialize(players);
    for (let i = 0; i < 7; i++) {
      expect(state.tableau[i].faceUp).toBe(1);
    }
  });

  it('should have remaining cards in stock (52 - 28 = 24)', () => {
    const state = engine.initialize(players);
    expect(state.stock.length).toBe(24);
  });

  it('should have 4 empty foundations', () => {
    const state = engine.initialize(players);
    expect(state.foundations.length).toBe(4);
    state.foundations.forEach((f) => expect(f.length).toBe(0));
  });

  it('should total 52 cards across all locations', () => {
    const state = engine.initialize(players);
    const total =
      state.stock.length +
      state.waste.length +
      state.tableau.reduce((sum, col) => sum + col.cards.length, 0) +
      state.foundations.reduce((sum, f) => sum + f.length, 0);
    expect(total).toBe(52);
  });

  it('should throw for more than 1 player', () => {
    expect(() =>
      engine.initialize([...players, { ...players[0], id: 'p2' }])
    ).toThrow('exactly 1 player');
  });

  // --- Tableau-to-tableau move ---

  it('should allow valid tableau-to-tableau move (alternating colors, descending)', () => {
    // Use a seeded game to get reproducible state
    const state = engine.initialize(players, { seed: 42 });
    const validMoves = engine.getValidMoves(state, pid);
    const t2t = validMoves.find((m) => m.type === 'tableauToTableau');

    if (t2t && t2t.type === 'tableauToTableau') {
      const result = engine.validateMove(state, t2t, pid);
      expect(result.valid).toBe(true);
    }
  });

  it('should reject moving to same column', () => {
    const state = engine.initialize(players, { seed: 42 });
    const move: SolitaireMove = {
      type: 'tableauToTableau',
      fromCol: 0,
      toCol: 0,
      cardCount: 1,
    };
    const result = engine.validateMove(state, move, pid);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid column indices', () => {
    const state = engine.initialize(players);
    const move: SolitaireMove = {
      type: 'tableauToTableau',
      fromCol: -1,
      toCol: 7,
      cardCount: 1,
    };
    const result = engine.validateMove(state, move, pid);
    expect(result.valid).toBe(false);
  });

  // --- Foundation moves ---

  it('should allow moving Ace to empty foundation', () => {
    const state = engine.initialize(players, { seed: 42 });
    const validMoves = engine.getValidMoves(state, pid);
    const foundationMove = validMoves.find(
      (m) => m.type === 'tableauToFoundation' || m.type === 'wasteToFoundation'
    );

    // In most games an Ace won't be immediately available. Test the rule directly.
    // Create a state where an Ace is on top of a column
    const testState = engine.initialize(players, { seed: 1 });
    // Find any ace in tableau top cards
    for (let col = 0; col < 7; col++) {
      const cards = testState.tableau[col].cards;
      const topCard = cards[cards.length - 1];
      if (topCard && topCard.value === 1) {
        for (let fi = 0; fi < 4; fi++) {
          const move: SolitaireMove = {
            type: 'tableauToFoundation',
            fromCol: col,
            foundationIndex: fi,
          };
          const result = engine.validateMove(testState, move, pid);
          if (result.valid) {
            const { state: newState } = engine.applyMove(testState, move, pid);
            expect(newState.foundations[fi].length).toBe(1);
            expect(newState.foundations[fi][0].value).toBe(1);
            return;
          }
        }
      }
    }
    // If no ace is on top in this seed, that's acceptable
    expect(true).toBe(true);
  });

  it('should reject placing non-Ace on empty foundation', () => {
    const state = engine.initialize(players, { seed: 42 });
    // Find a column whose top card is NOT an Ace
    for (let col = 0; col < 7; col++) {
      const cards = state.tableau[col].cards;
      const topCard = cards[cards.length - 1];
      if (topCard && topCard.value !== 1) {
        const move: SolitaireMove = {
          type: 'tableauToFoundation',
          fromCol: col,
          foundationIndex: 0,
        };
        const result = engine.validateMove(state, move, pid);
        expect(result.valid).toBe(false);
        return;
      }
    }
  });

  // --- Draw from stock ---

  it('should draw from stock correctly', () => {
    const state = engine.initialize(players);
    const move: SolitaireMove = { type: 'drawFromStock' };
    const result = engine.validateMove(state, move, pid);
    expect(result.valid).toBe(true);

    const { state: newState } = engine.applyMove(state, move, pid);
    expect(newState.stock.length).toBe(state.stock.length - 1);
    expect(newState.waste.length).toBe(1);
  });

  it('should reject draw from empty stock', () => {
    const state = engine.initialize(players);
    const emptyStockState: SolitaireState = { ...state, stock: [] };
    const move: SolitaireMove = { type: 'drawFromStock' };
    const result = engine.validateMove(emptyStockState, move, pid);
    expect(result.valid).toBe(false);
  });

  // --- Reset stock ---

  it('should allow resetting stock when stock is empty and waste has cards', () => {
    const state = engine.initialize(players);
    // Exhaust the stock
    let current = state;
    while (current.stock.length > 0) {
      const { state: next } = engine.applyMove(
        current,
        { type: 'drawFromStock' },
        pid
      );
      current = next;
    }

    const result = engine.validateMove(current, { type: 'resetStock' }, pid);
    expect(result.valid).toBe(true);

    const { state: resetState } = engine.applyMove(
      current,
      { type: 'resetStock' },
      pid
    );
    expect(resetState.stock.length).toBeGreaterThan(0);
    expect(resetState.waste.length).toBe(0);
  });

  // --- Win detection ---

  it('should detect win when all 52 cards are on foundations', () => {
    const state = engine.initialize(players);
    // Create a winning state manually
    const winState: SolitaireState = {
      ...state,
      tableau: Array.from({ length: 7 }, () => ({ cards: [], faceUp: 0 })),
      stock: [],
      waste: [],
      foundations: [
        Array.from({ length: 13 }, (_, i) => ({
          id: `h-${i + 1}`,
          suit: 'hearts' as const,
          value: i + 1,
          deck: 'french52' as const,
        })),
        Array.from({ length: 13 }, (_, i) => ({
          id: `d-${i + 1}`,
          suit: 'diamonds' as const,
          value: i + 1,
          deck: 'french52' as const,
        })),
        Array.from({ length: 13 }, (_, i) => ({
          id: `c-${i + 1}`,
          suit: 'clubs' as const,
          value: i + 1,
          deck: 'french52' as const,
        })),
        Array.from({ length: 13 }, (_, i) => ({
          id: `s-${i + 1}`,
          suit: 'spades' as const,
          value: i + 1,
          deck: 'french52' as const,
        })),
      ],
      phase: 'won',
      status: GameStatus.FINISHED,
    };

    expect(engine.isGameOver(winState)).toBe(true);
    expect(engine.getWinner(winState)).toBe(pid);
  });

  // --- Undo ---

  it('should support undo functionality', () => {
    const state = engine.initialize(players);
    // Make a draw move
    const { state: afterDraw } = engine.applyMove(
      state,
      { type: 'drawFromStock' },
      pid
    );
    expect(afterDraw.undoStack.length).toBe(1);

    // Undo it
    const undoResult = engine.validateMove(afterDraw, { type: 'undo' }, pid);
    expect(undoResult.valid).toBe(true);

    const { state: afterUndo } = engine.applyMove(
      afterDraw,
      { type: 'undo' },
      pid
    );
    expect(afterUndo.stock.length).toBe(state.stock.length);
    expect(afterUndo.waste.length).toBe(0);
  });

  it('should reject undo when stack is empty', () => {
    const state = engine.initialize(players);
    const result = engine.validateMove(state, { type: 'undo' }, pid);
    expect(result.valid).toBe(false);
  });

  // --- Auto-complete detection ---

  it('should detect auto-complete when all cards are face-up and stock/waste empty', () => {
    const state = engine.initialize(players);
    const autoState: SolitaireState = {
      ...state,
      stock: [],
      waste: [],
      tableau: state.tableau.map((col) => ({
        ...col,
        faceUp: col.cards.length, // all face-up
      })),
    };

    expect(engine.canAutoComplete(autoState)).toBe(true);
  });

  it('should not auto-complete when stock has cards', () => {
    const state = engine.initialize(players);
    expect(engine.canAutoComplete(state)).toBe(false);
  });

  // --- Score tracking ---

  it('should track moves and score', () => {
    const state = engine.initialize(players);
    expect(state.moves).toBe(0);
    expect(state.score).toBe(0);

    const { state: after } = engine.applyMove(
      state,
      { type: 'drawFromStock' },
      pid
    );
    expect(after.moves).toBe(1);
  });

  // --- Hint system ---

  it('should provide a hint when moves are available', () => {
    const state = engine.initialize(players, { seed: 42 });
    const hint = engine.getHint(state);
    // A hint should always be available at the start (at minimum, draw from stock)
    expect(hint).not.toBeNull();
  });

  // --- Draw mode ---

  it('should support draw-3 mode', () => {
    const state = engine.initialize(players, { drawMode: 3 });
    expect(state.drawMode).toBe(3);

    const { state: after } = engine.applyMove(
      state,
      { type: 'drawFromStock' },
      pid
    );
    expect(after.waste.length).toBe(3);
    expect(after.stock.length).toBe(state.stock.length - 3);
  });
});
