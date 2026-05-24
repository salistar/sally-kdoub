import { Card } from '@sally/types';
import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { DeckManager } from '../../deck-manager';
import {
  QuiEstCeState,
  QuiEstCeMove,
  QuiEstCeConfig,
  BoardCard,
  QuestionEntry,
} from './quiestce.types';
import { evaluateQuestion, formatQuestion } from './question-bank';

function cloneState(state: QuiEstCeState): QuiEstCeState {
  const boards: Record<string, BoardCard[]> = {};
  for (const [pid, board] of Object.entries(state.boards)) {
    boards[pid] = board.map((bc) => ({ card: { ...bc.card }, isEliminated: bc.isEliminated }));
  }
  const secretCards: Record<string, Card> = {};
  for (const [pid, card] of Object.entries(state.secretCards)) {
    secretCards[pid] = { ...card };
  }
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    boards,
    secretCards,
    questions: state.questions.map((q) => ({ ...q })),
    questionsAsked: { ...state.questionsAsked },
  };
}

export class QuiEstCeEngine extends GameEngine<
  QuiEstCeState,
  QuiEstCeMove,
  QuiEstCeConfig
> {
  readonly gameType = GameType.QUIESTCE;
  readonly minPlayers = 2;
  readonly maxPlayers = 2;

  private deckManager = new DeckManager();

  initialize(
    players: Player[],
    config: Partial<QuiEstCeConfig> = {}
  ): QuiEstCeState {
    if (players.length !== 2) {
      throw new Error('Qui Est-Ce requires exactly 2 players');
    }

    const maxQuestions = config.maxQuestions ?? 7;
    const deck = this.deckManager.shuffle(
      this.deckManager.createDeck('spanish40'),
      config.seed
    );

    // Each player gets the same set of 40 cards on their board
    const boards: Record<string, BoardCard[]> = {};
    for (const player of players) {
      boards[player.id] = deck.map((card) => ({
        card: { ...card },
        isEliminated: false,
      }));
    }

    const questionsAsked: Record<string, number> = {};
    for (const player of players) {
      questionsAsked[player.id] = 0;
    }

    return {
      id: `quiestce-${Date.now()}`,
      type: GameType.QUIESTCE,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'choosing',
      createdAt: Date.now(),
      boards,
      secretCards: {},
      questions: [],
      maxQuestions,
      questionsAsked,
    };
  }

  validateMove(
    state: QuiEstCeState,
    move: QuiEstCeMove,
    playerId: string
  ): ValidationResult {
    if (state.phase === 'ended') {
      return { valid: false, reason: 'Game is over' };
    }

    switch (move.type) {
      case 'chooseSecret':
        return this.validateChooseSecret(state, move.cardId, playerId);
      case 'askQuestion':
        return this.validateAskQuestion(state, playerId);
      case 'eliminateCard':
        return this.validateEliminateCard(state, move.cardId, playerId);
      case 'guess':
        return this.validateGuess(state, playerId);
      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: QuiEstCeState,
    move: QuiEstCeMove,
    playerId: string
  ): { state: QuiEstCeState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    switch (move.type) {
      case 'chooseSecret': {
        const card = this.findCardOnBoard(newState, playerId, move.cardId);
        newState.secretCards[playerId] = { ...card! };

        events.push({
          type: 'secretChosen',
          playerId,
          payload: { cardId: move.cardId },
          timestamp: Date.now(),
        });

        // Check if both players have chosen
        const bothChosen = newState.players.every(
          (p) => newState.secretCards[p.id] !== undefined
        );
        if (bothChosen) {
          newState.phase = 'playing';
          newState.currentPlayerId = newState.players[0].id;
          events.push({
            type: 'phaseChanged',
            payload: { phase: 'playing' },
            timestamp: Date.now(),
          });
        } else {
          // Switch to other player for choosing
          const otherPlayer = newState.players.find((p) => p.id !== playerId)!;
          newState.currentPlayerId = otherPlayer.id;
        }
        break;
      }

      case 'askQuestion': {
        const opponentId = this.getOpponentId(newState, playerId);
        const opponentSecret = newState.secretCards[opponentId];
        const answer = evaluateQuestion(move.question, opponentSecret, move.value);

        const entry: QuestionEntry = {
          playerId,
          question: formatQuestion(move.question, 'en', move.value),
          questionType: move.question,
          value: move.value,
          answer,
        };
        newState.questions.push(entry);
        newState.questionsAsked[playerId] = (newState.questionsAsked[playerId] || 0) + 1;

        events.push({
          type: 'questionAsked',
          playerId,
          payload: {
            questionType: move.question,
            value: move.value,
            answer,
            questionText: entry.question,
          },
          timestamp: Date.now(),
        });

        // Advance to next player's turn
        newState.currentPlayerId = this.getOpponentId(newState, playerId);
        newState.turnNumber++;

        // Check if both players exhausted questions
        const allExhausted = newState.players.every(
          (p) => (newState.questionsAsked[p.id] || 0) >= newState.maxQuestions
        );
        if (allExhausted) {
          newState.phase = 'ended';
          newState.status = GameStatus.FINISHED;
          events.push({
            type: 'gameOver',
            payload: { reason: 'maxQuestionsReached' },
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'eliminateCard': {
        const board = newState.boards[playerId];
        const cardEntry = board.find((bc) => bc.card.id === move.cardId);
        if (cardEntry) {
          cardEntry.isEliminated = true;
        }

        events.push({
          type: 'cardEliminated',
          playerId,
          payload: { cardId: move.cardId },
          timestamp: Date.now(),
        });
        // Eliminating does not use a turn or switch players
        break;
      }

      case 'guess': {
        const opponentId = this.getOpponentId(newState, playerId);
        const opponentSecret = newState.secretCards[opponentId];
        const correct = opponentSecret.id === move.cardId;

        events.push({
          type: 'guessAttempt',
          playerId,
          payload: {
            cardId: move.cardId,
            correct,
            actualCard: opponentSecret,
          },
          timestamp: Date.now(),
        });

        newState.phase = 'ended';
        newState.status = GameStatus.FINISHED;

        if (correct) {
          // Guesser wins
          events.push({
            type: 'gameOver',
            payload: { winner: playerId, reason: 'correctGuess' },
            timestamp: Date.now(),
          });
        } else {
          // Guesser loses - opponent wins
          events.push({
            type: 'gameOver',
            payload: { winner: opponentId, reason: 'wrongGuess' },
            timestamp: Date.now(),
          });
        }
        break;
      }
    }

    return { state: newState, events };
  }

  calculateScore(state: QuiEstCeState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      // Score based on fewer questions asked (efficiency)
      const asked = state.questionsAsked[player.id] || 0;
      scores.set(player.id, Math.max(0, state.maxQuestions - asked));
    }
    return scores;
  }

  isGameOver(state: QuiEstCeState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: QuiEstCeState): string | null {
    if (state.phase !== 'ended') return null;

    // Check if someone made a guess
    const guessEvents = state.questions; // We track via the state
    // Look at the last action - if it was a correct guess, that player wins
    // If wrong guess, opponent wins.
    // This is tracked in events but we need it in state too.
    // We can infer from the game state:

    // If there are no secretCards set, game wasn't fully started
    if (Object.keys(state.secretCards).length < 2) return null;

    // Check all questions exhausted - no winner (draw)
    const allExhausted = state.players.every(
      (p) => (state.questionsAsked[p.id] || 0) >= state.maxQuestions
    );
    if (allExhausted) return null;

    // Otherwise the winner is determined by the guess result which is
    // handled at applyMove time. We can't determine from state alone after
    // serialization, so we return null and rely on events.
    return null;
  }

  getValidMoves(state: QuiEstCeState, playerId: string): QuiEstCeMove[] {
    if (state.phase === 'ended') return [];

    const moves: QuiEstCeMove[] = [];

    if (state.phase === 'choosing') {
      // Player must choose a secret card if they haven't yet
      if (!state.secretCards[playerId] && state.currentPlayerId === playerId) {
        const board = state.boards[playerId];
        for (const bc of board) {
          moves.push({ type: 'chooseSecret', cardId: bc.card.id });
        }
      }
      return moves;
    }

    // Playing phase
    if (state.currentPlayerId !== playerId) {
      // Can still eliminate cards on your own board even when not your turn
      const board = state.boards[playerId];
      for (const bc of board) {
        if (!bc.isEliminated) {
          moves.push({ type: 'eliminateCard', cardId: bc.card.id });
        }
      }
      return moves;
    }

    // It's this player's turn
    const asked = state.questionsAsked[playerId] || 0;

    // Can ask questions if under limit
    if (asked < state.maxQuestions) {
      // Generate question moves for all question types
      moves.push({ type: 'askQuestion', question: 'isFigure' });
      moves.push({ type: 'askQuestion', question: 'isAce' });
      moves.push({ type: 'askQuestion', question: 'isOdd' });
      moves.push({ type: 'askQuestion', question: 'isEven' });

      // Suit questions
      for (const suit of ['oros', 'copas', 'espadas', 'bastos']) {
        moves.push({ type: 'askQuestion', question: 'isSuit', value: suit });
      }

      // Value comparison questions
      const spanishValues = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
      for (const v of spanishValues) {
        moves.push({ type: 'askQuestion', question: 'isValueGreaterThan', value: v });
        moves.push({ type: 'askQuestion', question: 'isValueLessThan', value: v });
        moves.push({ type: 'askQuestion', question: 'isExactValue', value: v });
      }
    }

    // Can always guess (risky if wrong)
    const opponentId = this.getOpponentId(state, playerId);
    const board = state.boards[playerId];
    for (const bc of board) {
      if (!bc.isEliminated) {
        moves.push({ type: 'guess', cardId: bc.card.id });
      }
    }

    // Can eliminate cards on own board
    for (const bc of board) {
      if (!bc.isEliminated) {
        moves.push({ type: 'eliminateCard', cardId: bc.card.id });
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: QuiEstCeState): string {
    return state.currentPlayerId;
  }

  // --- Private helpers ---

  private validateChooseSecret(
    state: QuiEstCeState,
    cardId: string,
    playerId: string
  ): ValidationResult {
    if (state.phase !== 'choosing') {
      return { valid: false, reason: 'Not in choosing phase' };
    }
    if (state.currentPlayerId !== playerId) {
      return { valid: false, reason: 'Not your turn to choose' };
    }
    if (state.secretCards[playerId]) {
      return { valid: false, reason: 'You already chose a secret card' };
    }
    const card = this.findCardOnBoard(state, playerId, cardId);
    if (!card) {
      return { valid: false, reason: 'Card not found on your board' };
    }
    return { valid: true };
  }

  private validateAskQuestion(
    state: QuiEstCeState,
    playerId: string
  ): ValidationResult {
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }
    if (state.currentPlayerId !== playerId) {
      return { valid: false, reason: 'Not your turn' };
    }
    const asked = state.questionsAsked[playerId] || 0;
    if (asked >= state.maxQuestions) {
      return { valid: false, reason: 'Maximum questions reached' };
    }
    return { valid: true };
  }

  private validateEliminateCard(
    state: QuiEstCeState,
    cardId: string,
    playerId: string
  ): ValidationResult {
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }
    const board = state.boards[playerId];
    if (!board) {
      return { valid: false, reason: 'No board found for player' };
    }
    const entry = board.find((bc) => bc.card.id === cardId);
    if (!entry) {
      return { valid: false, reason: 'Card not found on your board' };
    }
    if (entry.isEliminated) {
      return { valid: false, reason: 'Card already eliminated' };
    }
    return { valid: true };
  }

  private validateGuess(
    state: QuiEstCeState,
    playerId: string
  ): ValidationResult {
    if (state.phase !== 'playing') {
      return { valid: false, reason: 'Game is not in playing phase' };
    }
    if (state.currentPlayerId !== playerId) {
      return { valid: false, reason: 'Not your turn' };
    }
    return { valid: true };
  }

  private getOpponentId(state: QuiEstCeState, playerId: string): string {
    const opponent = state.players.find((p) => p.id !== playerId);
    if (!opponent) throw new Error('Opponent not found');
    return opponent.id;
  }

  private findCardOnBoard(
    state: QuiEstCeState,
    playerId: string,
    cardId: string
  ): Card | null {
    const board = state.boards[playerId];
    if (!board) return null;
    const entry = board.find((bc) => bc.card.id === cardId);
    return entry ? entry.card : null;
  }
}
