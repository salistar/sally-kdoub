import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';

export interface TableauColumn {
  cards: Card[];
  faceUp: number; // number of face-up cards (from the bottom of the column)
}

export interface SolitaireState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'playing' | 'won' | 'lost';
  createdAt: number;

  tableau: TableauColumn[]; // 7 columns
  foundations: Card[][]; // 4 piles (one per suit)
  stock: Card[]; // draw pile
  waste: Card[]; // flipped cards from stock
  drawMode: 1 | 3; // draw 1 or 3 cards
  moves: number; // move counter
  score: number;
  undoStack: SolitaireState[];
}

export type SolitaireMove =
  | { type: 'tableauToTableau'; fromCol: number; toCol: number; cardCount: number }
  | { type: 'tableauToFoundation'; fromCol: number; foundationIndex: number }
  | { type: 'wasteToTableau'; toCol: number }
  | { type: 'wasteToFoundation'; foundationIndex: number }
  | { type: 'drawFromStock' }
  | { type: 'resetStock' }
  | { type: 'undo' };

export interface SolitaireConfig {
  drawMode: 1 | 3;
  seed?: number;
}
