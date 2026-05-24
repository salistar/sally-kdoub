import { Card, FrenchSuit, Suit } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import { SolitaireState, SolitaireMove, SolitaireConfig, TableauColumn } from './solitaire.types';

const FOUNDATION_SUIT_ORDER: FrenchSuit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

function isRed(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

function isBlack(suit: Suit): boolean {
  return suit === 'clubs' || suit === 'spades';
}

function oppositeColor(a: Suit, b: Suit): boolean {
  return (isRed(a) && isBlack(b)) || (isBlack(a) && isRed(b));
}

function cloneState(state: SolitaireState): SolitaireState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    tableau: state.tableau.map((col) => ({
      cards: col.cards.map((c) => ({ ...c })),
      faceUp: col.faceUp,
    })),
    foundations: state.foundations.map((f) => f.map((c) => ({ ...c }))),
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    undoStack: [], // don't deep clone the undo stack to avoid memory explosion
  };
}

function snapshotForUndo(state: SolitaireState): SolitaireState {
  const snapshot = cloneState(state);
  snapshot.undoStack = [];
  return snapshot;
}

/** Get the face-up cards from a tableau column */
function getFaceUpCards(col: TableauColumn): Card[] {
  if (col.cards.length === 0) return [];
  return col.cards.slice(col.cards.length - col.faceUp);
}

/** Get the top card of a tableau column (last card) */
function topCard(col: TableauColumn): Card | undefined {
  return col.cards[col.cards.length - 1];
}

export class SolitaireEngine extends GameEngine<SolitaireState, SolitaireMove, SolitaireConfig> {
  readonly gameType = GameType.SOLITAIRE;
  readonly minPlayers = 1;
  readonly maxPlayers = 1;

  private deckManager = new DeckManager();

  initialize(players: Player[], config: Partial<SolitaireConfig> = {}): SolitaireState {
    if (players.length !== 1) {
      throw new Error('Solitaire requires exactly 1 player');
    }

    const drawMode = config.drawMode ?? 1;
    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('french52'),
      config.seed
    );

    // Deal tableau: 7 columns, column i gets i+1 cards, top card face up
    const tableau: TableauColumn[] = [];
    let cardIndex = 0;
    for (let i = 0; i < 7; i++) {
      const count = i + 1;
      const cards = deck.slice(cardIndex, cardIndex + count);
      cardIndex += count;
      tableau.push({ cards, faceUp: 1 });
    }

    // Remaining cards go to stock
    const stock = deck.slice(cardIndex);

    return {
      id: `solitaire-${Date.now()}`,
      type: GameType.SOLITAIRE,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'playing',
      createdAt: Date.now(),
      tableau,
      foundations: [[], [], [], []],
      stock,
      waste: [],
      drawMode,
      moves: 0,
      score: 0,
      undoStack: [],
    };
  }

  validateMove(state: SolitaireState, move: SolitaireMove, playerId: string): ValidationResult {
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is over' };
    }

    switch (move.type) {
      case 'drawFromStock':
        return this.validateDrawFromStock(state);
      case 'resetStock':
        return this.validateResetStock(state);
      case 'tableauToTableau':
        return this.validateTableauToTableau(state, move.fromCol, move.toCol, move.cardCount);
      case 'tableauToFoundation':
        return this.validateTableauToFoundation(state, move.fromCol, move.foundationIndex);
      case 'wasteToTableau':
        return this.validateWasteToTableau(state, move.toCol);
      case 'wasteToFoundation':
        return this.validateWasteToFoundation(state, move.foundationIndex);
      case 'undo':
        return state.undoStack.length > 0
          ? { valid: true }
          : { valid: false, reason: 'Nothing to undo' };
      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: SolitaireState,
    move: SolitaireMove,
    _playerId: string
  ): { state: SolitaireState; events: GameEvent[] } {
    const events: GameEvent[] = [];

    if (move.type === 'undo') {
      const prevState = state.undoStack[state.undoStack.length - 1];
      if (!prevState) throw new Error('Nothing to undo');
      // Restore with current undo stack minus the last entry
      const restored = cloneState(prevState);
      restored.undoStack = state.undoStack.slice(0, -1);
      events.push({ type: 'undo', payload: {}, timestamp: Date.now() });
      return { state: restored, events };
    }

    // Save state for undo before applying move
    const newState = cloneState(state);
    newState.undoStack = [...state.undoStack, snapshotForUndo(state)];
    // Cap undo stack at 50
    if (newState.undoStack.length > 50) {
      newState.undoStack = newState.undoStack.slice(-50);
    }

    switch (move.type) {
      case 'drawFromStock':
        this.applyDrawFromStock(newState);
        events.push({ type: 'drawFromStock', payload: { count: newState.drawMode }, timestamp: Date.now() });
        break;
      case 'resetStock':
        this.applyResetStock(newState);
        events.push({ type: 'resetStock', payload: {}, timestamp: Date.now() });
        break;
      case 'tableauToTableau':
        this.applyTableauToTableau(newState, move.fromCol, move.toCol, move.cardCount);
        events.push({
          type: 'tableauToTableau',
          payload: { fromCol: move.fromCol, toCol: move.toCol, cardCount: move.cardCount },
          timestamp: Date.now(),
        });
        break;
      case 'tableauToFoundation':
        this.applyTableauToFoundation(newState, move.fromCol, move.foundationIndex);
        newState.score += 10;
        events.push({
          type: 'tableauToFoundation',
          payload: { fromCol: move.fromCol, foundationIndex: move.foundationIndex },
          timestamp: Date.now(),
        });
        break;
      case 'wasteToTableau':
        this.applyWasteToTableau(newState, move.toCol);
        newState.score += 5;
        events.push({
          type: 'wasteToTableau',
          payload: { toCol: move.toCol },
          timestamp: Date.now(),
        });
        break;
      case 'wasteToFoundation':
        this.applyWasteToFoundation(newState, move.foundationIndex);
        newState.score += 10;
        events.push({
          type: 'wasteToFoundation',
          payload: { foundationIndex: move.foundationIndex },
          timestamp: Date.now(),
        });
        break;
    }

    newState.moves++;
    newState.turnNumber++;

    // Check win condition
    const totalFoundation = newState.foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalFoundation === 52) {
      newState.phase = 'won';
      newState.status = GameStatus.FINISHED;
      events.push({ type: 'gameWon', payload: { score: newState.score }, timestamp: Date.now() });
    }

    return { state: newState, events };
  }

  calculateScore(state: SolitaireState): Map<string, number> {
    const scores = new Map<string, number>();
    scores.set(state.currentPlayerId, state.score);
    return scores;
  }

  isGameOver(state: SolitaireState): boolean {
    return state.phase === 'won' || state.phase === 'lost';
  }

  getWinner(state: SolitaireState): string | null {
    return state.phase === 'won' ? state.currentPlayerId : null;
  }

  getValidMoves(state: SolitaireState, _playerId: string): SolitaireMove[] {
    if (state.phase !== 'playing') return [];

    const moves: SolitaireMove[] = [];

    // Draw from stock
    if (state.stock.length > 0) {
      moves.push({ type: 'drawFromStock' });
    }

    // Reset stock
    if (state.stock.length === 0 && state.waste.length > 0) {
      moves.push({ type: 'resetStock' });
    }

    // Waste to tableau
    if (state.waste.length > 0) {
      const wasteCard = state.waste[state.waste.length - 1];
      for (let col = 0; col < 7; col++) {
        if (this.canPlaceOnTableau(wasteCard, state.tableau[col])) {
          moves.push({ type: 'wasteToTableau', toCol: col });
        }
      }
    }

    // Waste to foundation
    if (state.waste.length > 0) {
      const wasteCard = state.waste[state.waste.length - 1];
      for (let fi = 0; fi < 4; fi++) {
        if (this.canPlaceOnFoundation(wasteCard, state.foundations[fi])) {
          moves.push({ type: 'wasteToFoundation', foundationIndex: fi });
        }
      }
    }

    // Tableau to tableau
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const col = state.tableau[fromCol];
      if (col.cards.length === 0) continue;
      const faceUpCards = getFaceUpCards(col);

      for (let count = 1; count <= faceUpCards.length; count++) {
        const startIdx = col.cards.length - count;
        const movingCard = col.cards[startIdx];

        for (let toCol = 0; toCol < 7; toCol++) {
          if (toCol === fromCol) continue;
          if (this.canPlaceOnTableau(movingCard, state.tableau[toCol])) {
            // Avoid no-op: moving a King to an empty column from another empty-beneath position
            const targetCol = state.tableau[toCol];
            if (targetCol.cards.length === 0 && startIdx === 0) {
              // Moving the entire column to an empty column - pointless unless it reveals a face-down card
              if (col.faceUp >= col.cards.length) continue;
            }
            moves.push({ type: 'tableauToTableau', fromCol, toCol, cardCount: count });
          }
        }
      }
    }

    // Tableau to foundation
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const col = state.tableau[fromCol];
      if (col.cards.length === 0) continue;
      const card = topCard(col)!;
      for (let fi = 0; fi < 4; fi++) {
        if (this.canPlaceOnFoundation(card, state.foundations[fi])) {
          moves.push({ type: 'tableauToFoundation', fromCol, foundationIndex: fi });
        }
      }
    }

    // Undo
    if (state.undoStack.length > 0) {
      moves.push({ type: 'undo' });
    }

    return moves;
  }

  getCurrentPlayerId(state: SolitaireState): string {
    return state.currentPlayerId;
  }

  /** Check if all remaining cards are face-up (auto-complete possible) */
  canAutoComplete(state: SolitaireState): boolean {
    if (state.phase !== 'playing') return false;
    // Stock and waste must be empty
    if (state.stock.length > 0 || state.waste.length > 0) return false;
    // All tableau cards must be face-up
    for (const col of state.tableau) {
      if (col.cards.length > 0 && col.faceUp < col.cards.length) {
        return false;
      }
    }
    return true;
  }

  /** Suggest the best move available */
  getHint(state: SolitaireState): SolitaireMove | null {
    if (state.phase !== 'playing') return null;

    // Priority 1: Move to foundation from tableau
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const col = state.tableau[fromCol];
      if (col.cards.length === 0) continue;
      const card = topCard(col)!;
      for (let fi = 0; fi < 4; fi++) {
        if (this.canPlaceOnFoundation(card, state.foundations[fi])) {
          return { type: 'tableauToFoundation', fromCol, foundationIndex: fi };
        }
      }
    }

    // Priority 2: Move to foundation from waste
    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      for (let fi = 0; fi < 4; fi++) {
        if (this.canPlaceOnFoundation(card, state.foundations[fi])) {
          return { type: 'wasteToFoundation', foundationIndex: fi };
        }
      }
    }

    // Priority 3: Tableau moves that reveal face-down cards
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const col = state.tableau[fromCol];
      if (col.cards.length === 0 || col.faceUp >= col.cards.length) continue;
      // Moving the face-up stack reveals a card
      const faceUpCards = getFaceUpCards(col);
      const bottomFaceUp = faceUpCards[0];
      for (let toCol = 0; toCol < 7; toCol++) {
        if (toCol === fromCol) continue;
        if (this.canPlaceOnTableau(bottomFaceUp, state.tableau[toCol])) {
          return {
            type: 'tableauToTableau',
            fromCol,
            toCol,
            cardCount: faceUpCards.length,
          };
        }
      }
    }

    // Priority 4: Waste to tableau
    if (state.waste.length > 0) {
      const card = state.waste[state.waste.length - 1];
      for (let col = 0; col < 7; col++) {
        if (this.canPlaceOnTableau(card, state.tableau[col])) {
          return { type: 'wasteToTableau', toCol: col };
        }
      }
    }

    // Priority 5: Move Kings to empty columns (if it reveals a card)
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const col = state.tableau[fromCol];
      if (col.cards.length === 0) continue;
      const faceUpCards = getFaceUpCards(col);
      const bottomFaceUp = faceUpCards[0];
      if (bottomFaceUp.value === 13 && col.faceUp < col.cards.length) {
        for (let toCol = 0; toCol < 7; toCol++) {
          if (toCol === fromCol) continue;
          if (state.tableau[toCol].cards.length === 0) {
            return {
              type: 'tableauToTableau',
              fromCol,
              toCol,
              cardCount: faceUpCards.length,
            };
          }
        }
      }
    }

    // Priority 6: Draw from stock
    if (state.stock.length > 0) {
      return { type: 'drawFromStock' };
    }

    // Priority 7: Reset stock
    if (state.stock.length === 0 && state.waste.length > 0) {
      return { type: 'resetStock' };
    }

    return null;
  }

  // --- Validation helpers ---

  private validateDrawFromStock(state: SolitaireState): ValidationResult {
    if (state.stock.length === 0) {
      return { valid: false, reason: 'Stock is empty. Reset stock first.' };
    }
    return { valid: true };
  }

  private validateResetStock(state: SolitaireState): ValidationResult {
    if (state.stock.length > 0) {
      return { valid: false, reason: 'Stock is not empty' };
    }
    if (state.waste.length === 0) {
      return { valid: false, reason: 'Waste is also empty' };
    }
    return { valid: true };
  }

  private validateTableauToTableau(
    state: SolitaireState,
    fromCol: number,
    toCol: number,
    cardCount: number
  ): ValidationResult {
    if (fromCol < 0 || fromCol >= 7 || toCol < 0 || toCol >= 7) {
      return { valid: false, reason: 'Invalid column index' };
    }
    if (fromCol === toCol) {
      return { valid: false, reason: 'Cannot move to same column' };
    }
    const col = state.tableau[fromCol];
    if (col.cards.length === 0) {
      return { valid: false, reason: 'Source column is empty' };
    }
    if (cardCount < 1 || cardCount > col.faceUp) {
      return { valid: false, reason: 'Invalid card count - can only move face-up cards' };
    }

    const startIdx = col.cards.length - cardCount;
    const movingCard = col.cards[startIdx];

    if (!this.canPlaceOnTableau(movingCard, state.tableau[toCol])) {
      return { valid: false, reason: 'Cannot place card on target column - must alternate colors and descend in value' };
    }

    return { valid: true };
  }

  private validateTableauToFoundation(
    state: SolitaireState,
    fromCol: number,
    foundationIndex: number
  ): ValidationResult {
    if (fromCol < 0 || fromCol >= 7) {
      return { valid: false, reason: 'Invalid column index' };
    }
    if (foundationIndex < 0 || foundationIndex >= 4) {
      return { valid: false, reason: 'Invalid foundation index' };
    }
    const col = state.tableau[fromCol];
    if (col.cards.length === 0) {
      return { valid: false, reason: 'Column is empty' };
    }
    const card = topCard(col)!;
    if (!this.canPlaceOnFoundation(card, state.foundations[foundationIndex])) {
      return { valid: false, reason: 'Cannot place card on foundation - must build up by suit from Ace' };
    }
    return { valid: true };
  }

  private validateWasteToTableau(state: SolitaireState, toCol: number): ValidationResult {
    if (state.waste.length === 0) {
      return { valid: false, reason: 'Waste is empty' };
    }
    if (toCol < 0 || toCol >= 7) {
      return { valid: false, reason: 'Invalid column index' };
    }
    const card = state.waste[state.waste.length - 1];
    if (!this.canPlaceOnTableau(card, state.tableau[toCol])) {
      return { valid: false, reason: 'Cannot place card on tableau column' };
    }
    return { valid: true };
  }

  private validateWasteToFoundation(state: SolitaireState, foundationIndex: number): ValidationResult {
    if (state.waste.length === 0) {
      return { valid: false, reason: 'Waste is empty' };
    }
    if (foundationIndex < 0 || foundationIndex >= 4) {
      return { valid: false, reason: 'Invalid foundation index' };
    }
    const card = state.waste[state.waste.length - 1];
    if (!this.canPlaceOnFoundation(card, state.foundations[foundationIndex])) {
      return { valid: false, reason: 'Cannot place card on foundation' };
    }
    return { valid: true };
  }

  // --- Apply helpers ---

  private applyDrawFromStock(state: SolitaireState): void {
    const count = Math.min(state.drawMode, state.stock.length);
    for (let i = 0; i < count; i++) {
      const card = state.stock.shift()!;
      state.waste.push(card);
    }
  }

  private applyResetStock(state: SolitaireState): void {
    // Flip waste back to stock (reverse order so the bottom of waste becomes top of stock)
    state.stock = state.waste.reverse();
    state.waste = [];
  }

  private applyTableauToTableau(
    state: SolitaireState,
    fromCol: number,
    toCol: number,
    cardCount: number
  ): void {
    const source = state.tableau[fromCol];
    const target = state.tableau[toCol];
    const startIdx = source.cards.length - cardCount;
    const moving = source.cards.splice(startIdx, cardCount);
    target.cards.push(...moving);
    target.faceUp += cardCount;

    // Update source faceUp count
    source.faceUp -= cardCount;
    if (source.faceUp < 0) source.faceUp = 0;

    // Reveal new top card if needed
    if (source.cards.length > 0 && source.faceUp === 0) {
      source.faceUp = 1;
    }
  }

  private applyTableauToFoundation(
    state: SolitaireState,
    fromCol: number,
    foundationIndex: number
  ): void {
    const source = state.tableau[fromCol];
    const card = source.cards.pop()!;
    state.foundations[foundationIndex].push(card);

    source.faceUp = Math.max(0, source.faceUp - 1);

    // Reveal new top card if needed
    if (source.cards.length > 0 && source.faceUp === 0) {
      source.faceUp = 1;
    }
  }

  private applyWasteToTableau(state: SolitaireState, toCol: number): void {
    const card = state.waste.pop()!;
    const target = state.tableau[toCol];
    target.cards.push(card);
    target.faceUp += 1;
  }

  private applyWasteToFoundation(state: SolitaireState, foundationIndex: number): void {
    const card = state.waste.pop()!;
    state.foundations[foundationIndex].push(card);
  }

  // --- Placement rules ---

  private canPlaceOnTableau(card: Card, column: TableauColumn): boolean {
    if (column.cards.length === 0) {
      // Only Kings can go on empty columns
      return card.value === 13;
    }
    const top = column.cards[column.cards.length - 1];
    // Must alternate colors and descend by 1
    return oppositeColor(card.suit, top.suit) && card.value === top.value - 1;
  }

  private canPlaceOnFoundation(card: Card, foundation: Card[]): boolean {
    if (foundation.length === 0) {
      // Only Aces can start a foundation
      return card.value === 1;
    }
    const top = foundation[foundation.length - 1];
    // Same suit, ascending by 1
    return card.suit === top.suit && card.value === top.value + 1;
  }
}
