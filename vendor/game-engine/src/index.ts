export { GameEngine } from './lib/game-engine.base';
export type { ValidationResult, GameEvent } from './lib/game-engine.base';
export { DeckManager } from './lib/deck-manager';
export { TurnManager } from './lib/turn-manager';

// Bot difficulty presets (shared across all card-game apps)
export {
  BOT_PRESETS,
  parseDifficulty,
  thinkDelay,
  shouldRandomize,
  difficultyBadge,
  difficultyColor,
} from './lib/bot-difficulty';
export type { BotDifficulty, BotConfig } from './lib/bot-difficulty';

// Solitaire
export { SolitaireEngine } from './lib/games/solitaire/solitaire.engine';
export type {
  SolitaireState,
  SolitaireMove,
  SolitaireConfig,
  TableauColumn,
} from './lib/games/solitaire/solitaire.types';

// Concentration
export { ConcentrationEngine } from './lib/games/concentration/concentration.engine';
export type {
  ConcentrationState,
  ConcentrationMove,
  ConcentrationConfig,
  BoardCell,
} from './lib/games/concentration/concentration.types';

// Qui Est-Ce
export { QuiEstCeEngine } from './lib/games/quiestce/quiestce.engine';
export type {
  QuiEstCeState,
  QuiEstCeMove,
  QuiEstCeConfig,
  BoardCard,
  QuestionEntry,
  QuestionType,
} from './lib/games/quiestce/quiestce.types';
export { QUESTIONS, formatQuestion, evaluateQuestion } from './lib/games/quiestce/question-bank';

// Ronda
export { RondaEngine } from './lib/games/ronda/ronda.engine';
export type {
  RondaState,
  RondaMove,
  RondaConfig,
  AnnouncementType,
  Announcement,
} from './lib/games/ronda/ronda.types';

// Scopa
export { ScopaEngine } from './lib/games/scopa/scopa.engine';
export type {
  ScopaState,
  ScopaMove,
  ScopaConfig,
} from './lib/games/scopa/scopa.types';

// Okey
export { OkeyEngine, isValidHand } from './lib/games/okey/okey.engine';
export type {
  OkeyState,
  OkeyMove,
  OkeyConfig,
  OkeyTile,
} from './lib/games/okey/okey.types';

// Kdoub (Bluff)
export { KdoubEngine } from './lib/games/kdoub/kdoub.engine';
export type {
  KdoubState,
  KdoubMove,
  KdoubConfig,
  KdoubClaim,
} from './lib/games/kdoub/kdoub.types';

// Belote
export { BeloteEngine } from './lib/games/belote/belote.engine';
export type {
  BeloteState,
  BeloteMove,
  BeloteConfig,
  BeloteContract,
  TrickEntry,
  Trick,
  BiddingEntry,
} from './lib/games/belote/belote.types';

// Tarot
export { TarotEngine } from './lib/games/tarot/tarot.engine';
export type {
  TarotState,
  TarotMove,
  TarotConfig,
  TarotContract,
  TarotTrickEntry,
  TarotTrick,
} from './lib/games/tarot/tarot.types';

// Poker (Texas Hold'em)
export { PokerEngine, evaluateHand } from './lib/games/poker/poker.engine';
export type {
  PokerState,
  PokerMove,
  PokerConfig,
  PokerPlayer,
  PokerPlayerState,
  SidePot,
  HandEvaluation,
} from './lib/games/poker/poker.types';
export { HandRank } from './lib/games/poker/poker.types';

// Game State Store (Zustand)
export { createGameStore } from './lib/game-state-store';
export type {
  GameStoreState,
  GamePhase,
  ConnectionMode,
  Player as GamePlayer,
} from './lib/game-state-store';
