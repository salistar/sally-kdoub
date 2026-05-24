import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';

export interface BoardCard {
  card: Card;
  isEliminated: boolean;
}

export interface QuestionEntry {
  playerId: string;
  question: string;
  questionType: QuestionType;
  value?: unknown;
  answer: boolean;
}

export interface QuiEstCeState {
  id: string;
  type: GameType;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string;
  turnNumber: number;
  phase: 'choosing' | 'playing' | 'ended';
  createdAt: number;

  boards: Record<string, BoardCard[]>; // each player's board (40 Spanish cards)
  secretCards: Record<string, Card>; // each player's secret card
  questions: QuestionEntry[]; // question history
  maxQuestions: number; // default 7
  questionsAsked: Record<string, number>; // per player
}

export type QuiEstCeMove =
  | { type: 'chooseSecret'; cardId: string }
  | { type: 'askQuestion'; question: QuestionType; value?: unknown }
  | { type: 'eliminateCard'; cardId: string }
  | { type: 'guess'; cardId: string };

export type QuestionType =
  | 'isFigure'
  | 'isSuit'
  | 'isValueGreaterThan'
  | 'isValueLessThan'
  | 'isExactValue'
  | 'isOdd'
  | 'isEven'
  | 'isAce';

export interface QuiEstCeConfig {
  maxQuestions?: number;
  seed?: number;
}
