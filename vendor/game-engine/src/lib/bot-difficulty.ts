/**
 * @file bot-difficulty.ts
 * @description Preset de difficulté bot partagé par toutes les apps SallyCards.
 *
 * Chaque app peut consommer le BotDifficulty + BotConfig pour humaniser ses
 * bots :
 *  - easy   : 30 % de coups sous-optimaux, prise d'enchère bas-seuil
 *  - medium : 10 % d'erreurs, seuils standards
 *  - hard   : déterministe (0 % d'erreur), seuils élevés, anti-surenchère
 *
 * Pattern d'usage côté écran (à dupliquer dans chaque app) :
 *
 *   const params = useLocalSearchParams<{ difficulty?: string }>();
 *   const difficulty = parseDifficulty(params.difficulty); // 'easy'|'medium'|'hard'
 *   const config = BOT_PRESETS[difficulty];
 *   // ... config.randomness, config.aggression, etc.
 *
 * La home de chaque app passe `?difficulty=hard` (ou autre) lors du push.
 */

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface BotConfig {
  /** Niveau de difficulté. */
  difficulty: BotDifficulty;
  /** Probabilité (0..1) de jouer un coup sous-optimal (humanisation). */
  randomness: number;
  /** Agressivité (0..1) : prend plus de risques, mise plus haut, bluffe plus. */
  aggression: number;
  /** Profondeur d'anticipation (en plis/tours) — utile pour MCTS / minimax. */
  lookahead: number;
  /** Latence simulée min/max en ms (rend les bots "humains"). */
  thinkMs: [number, number];
}

/** Presets standards utilisés par toutes les apps card-game. */
export const BOT_PRESETS: Record<BotDifficulty, BotConfig> = {
  easy: {
    difficulty: 'easy',
    randomness: 0.30,
    aggression: 0.20,
    lookahead: 0,
    thinkMs: [400, 800],
  },
  medium: {
    difficulty: 'medium',
    randomness: 0.10,
    aggression: 0.50,
    lookahead: 1,
    thinkMs: [600, 1200],
  },
  hard: {
    difficulty: 'hard',
    randomness: 0.00,
    aggression: 0.75,
    lookahead: 2,
    thinkMs: [800, 1500],
  },
};

/**
 * Parse la valeur d'URL params en BotDifficulty.
 * Accepte les alias usuels : 'expert' → hard, '' → medium par défaut.
 */
export function parseDifficulty(raw: string | string[] | undefined): BotDifficulty {
  const d = (Array.isArray(raw) ? raw[0] : raw || '').toLowerCase();
  if (d === 'easy' || d === 'beginner' || d === 'noob') return 'easy';
  if (d === 'hard' || d === 'expert' || d === 'pro') return 'hard';
  return 'medium';
}

/**
 * Délai de réflexion aléatoire dans la plage du preset.
 * À utiliser dans les setTimeout des effets bot pour rendre l'IA "humaine".
 */
export function thinkDelay(config: BotConfig): number {
  const [min, max] = config.thinkMs;
  return min + Math.random() * (max - min);
}

/**
 * Décide si le bot doit jouer un coup sous-optimal (humanisation).
 * Retourne true si oui, false sinon. À appeler avant chaque décision.
 */
export function shouldRandomize(config: BotConfig): boolean {
  return Math.random() < config.randomness;
}

/**
 * Label court (3 lettres max) pour afficher en badge UI.
 * À utiliser comme : <Text>{difficultyBadge(config.difficulty)}</Text>
 */
export function difficultyBadge(d: BotDifficulty): string {
  return d === 'hard' ? 'HARD' : d === 'medium' ? 'MED' : 'EASY';
}

/** Couleur du badge difficulté (Tailwind tone). */
export function difficultyColor(d: BotDifficulty): string {
  return d === 'hard' ? '#DC2626' : d === 'medium' ? '#F59E0B' : '#10B981';
}
