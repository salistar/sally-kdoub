/**
 * KdoubEngine - Moteur de jeu Kdoub marocain
 * Jeu de cartes avec bluff utilisant le paquet espagnol de 40 cartes
 *
 * Règles:
 * - 2 à 10 joueurs (table partagée, chacun son tour)
 * - Paquet espagnol: 4 couleurs (bastos, copas, espadas, oros) x valeurs (1-7, 10-12)
 * - Chaque joueur reçoit des cartes, le reste forme la pioche
 * - Le PREMIER joueur d'une séquence DÉCLARE une valeur (ex: "As") en posant
 *   une carte face cachée. CETTE VALEUR EST ALORS VERROUILLÉE pour toute la
 *   séquence : tous les joueurs suivants doivent déclarer la MÊME valeur en
 *   posant leur carte face cachée (honnêtement OU en bluffant).
 * - Un joueur peut UNIQUEMENT changer la valeur déclarée quand une séquence
 *   est rompue par un "Kdoub!" (contestation) ou quand tout le monde passe
 *   sans contester (alors le joueur suivant peut recommencer avec une nouvelle
 *   valeur — cela clôt la séquence précédente).
 * - N'importe quel autre joueur peut crier "Kdoub!" pour contester
 * - Si la contestation est correcte (le joueur a menti): le menteur ramasse le tas
 * - Si la contestation est incorrecte: le contestataire ramasse le tas
 * - Le premier joueur à vider sa main gagne la manche
 * - Les points sont comptés par les cartes restantes en main
 */

// ============================================================
// TYPES
// ============================================================

export type Suit = 'bastos' | 'copas' | 'espadas' | 'oros';
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  suit: Suit;
  value: CardValue;
  id: string; // e.g. "07-copas"
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  score: number;
  isBot: boolean;
  isReady: boolean;
}

export type GamePhase =
  | 'waiting'      // En attente de joueurs
  | 'dealing'      // Distribution des cartes
  | 'playing'      // Tour en cours - le joueur doit poser une carte
  | 'declaring'    // Le joueur a posé une carte, doit déclarer une valeur
  | 'challenging'  // Fenêtre de contestation "Kdoub!"
  | 'revealing'    // Révélation de la carte après contestation
  | 'round_end'    // Fin de manche
  | 'game_over';   // Fin de partie

export interface PlayedCard {
  card: Card;           // La vraie carte posée
  declaredValue: CardValue; // La valeur déclarée (peut être un bluff)
  playerId: string;
  isBluff: boolean;
}

export interface ChallengeResult {
  challengerId: string;
  challengedPlayerId: string;
  playedCard: PlayedCard;
  wasBluff: boolean;     // true = le joueur mentait
  loserId: string;       // celui qui ramasse le tas
  cardsCollected: Card[];
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  pile: PlayedCard[];     // Le tas de cartes jouées
  deck: Card[];           // La pioche
  lastPlay: PlayedCard | null;
  lastChallenge: ChallengeResult | null;
  currentDeclaredValue: CardValue | null;
  roundNumber: number;
  maxRounds: number;
  targetScore: number;    // Score à atteindre pour perdre
  challengeTimer: number; // Temps restant pour contester (ms)
  winnerId: string | null;
}

export type GameAction =
  | { type: 'JOIN'; playerId: string; playerName: string; isBot?: boolean }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARD'; playerId: string; cardIndex: number; declaredValue: CardValue }
  | { type: 'CHALLENGE'; challengerId: string }
  | { type: 'PASS_CHALLENGE'; playerId: string }
  | { type: 'NEXT_TURN' }
  | { type: 'NEW_ROUND' }
  | { type: 'RESET' };

// ============================================================
// CONSTANTS
// ============================================================

export const SUITS: Suit[] = ['bastos', 'copas', 'espadas', 'oros'];
export const VALUES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export const SUIT_NAMES: Record<Suit, string> = {
  bastos: 'Bâtons',
  copas: 'Coupes',
  espadas: 'Épées',
  oros: 'Deniers',
};

export const VALUE_NAMES: Record<CardValue, string> = {
  1: 'As',
  2: 'Deux',
  3: 'Trois',
  4: 'Quatre',
  5: 'Cinq',
  6: 'Six',
  7: 'Sept',
  10: 'Sota (Valet)',
  11: 'Caballo (Cavalier)',
  12: 'Rey (Roi)',
};

/** Points par carte pour le calcul du score */
export const CARD_POINTS: Record<CardValue, number> = {
  1: 11,  // As = 11 points
  2: 0,
  3: 10,  // Trois = 10 points
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  10: 2,  // Sota = 2 points
  11: 3,  // Caballo = 3 points
  12: 4,  // Rey = 4 points
};

export const CHALLENGE_TIMEOUT_MS = 5000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DEFAULT_TARGET_SCORE = 100;
export const DEFAULT_MAX_ROUNDS = 10;

// ============================================================
// DECK
// ============================================================

/** Crée un paquet complet de 40 cartes espagnoles */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      const valueStr = value.toString().padStart(2, '0');
      deck.push({
        suit,
        value,
        id: `${valueStr}-${suit}`,
      });
    }
  }
  return deck;
}

/** Mélange un paquet (Fisher-Yates) */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Retourne le chemin de l'image pour une carte */
export function getCardImagePath(card: Card): string {
  return `${card.id}.png`;
}

export function getCardBackImagePath(): string {
  return 'back.png';
}

// ============================================================
// DISTRIBUTION
// ============================================================

/** Calcule le nombre de cartes par joueur selon le nombre de joueurs */
export function getCardsPerPlayer(playerCount: number): number {
  if (playerCount <= 2) return 10;
  if (playerCount === 3) return 10;
  if (playerCount === 4) return 8;
  if (playerCount === 5) return 7;
  return 6; // 6 joueurs
}

/** Distribue les cartes aux joueurs */
export function dealCards(
  players: Player[],
  deck: Card[]
): { players: Player[]; remainingDeck: Card[] } {
  const cardsPerPlayer = getCardsPerPlayer(players.length);
  const shuffled = shuffleDeck(deck);
  const updatedPlayers = players.map((player, index) => ({
    ...player,
    hand: shuffled.slice(
      index * cardsPerPlayer,
      (index + 1) * cardsPerPlayer
    ),
  }));
  const remainingDeck = shuffled.slice(players.length * cardsPerPlayer);
  return { players: updatedPlayers, remainingDeck };
}

// ============================================================
// LOGIQUE DE JEU
// ============================================================

/** Vérifie si un joueur peut jouer (a des cartes en main) */
export function canPlay(player: Player): boolean {
  return player.hand.length > 0;
}

/** Jouer une carte: retirer de la main et créer un PlayedCard */
export function playCard(
  player: Player,
  cardIndex: number,
  declaredValue: CardValue
): { updatedPlayer: Player; playedCard: PlayedCard } {
  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    throw new Error(`Index de carte invalide: ${cardIndex}`);
  }

  const card = player.hand[cardIndex];
  const isBluff = card.value !== declaredValue;

  const updatedHand = [...player.hand];
  updatedHand.splice(cardIndex, 1);

  return {
    updatedPlayer: { ...player, hand: updatedHand },
    playedCard: {
      card,
      declaredValue,
      playerId: player.id,
      isBluff,
    },
  };
}

/** Résoudre un défi "Kdoub!" */
export function resolveChallenge(
  challengerId: string,
  lastPlay: PlayedCard,
  pile: PlayedCard[]
): ChallengeResult {
  const wasBluff = lastPlay.isBluff;
  const loserId = wasBluff ? lastPlay.playerId : challengerId;
  const cardsCollected = pile.map((p) => p.card);

  return {
    challengerId,
    challengedPlayerId: lastPlay.playerId,
    playedCard: lastPlay,
    wasBluff,
    loserId,
    cardsCollected,
  };
}

/** Ajouter les cartes du tas à la main du perdant */
export function collectPile(
  player: Player,
  cards: Card[]
): Player {
  return {
    ...player,
    hand: [...player.hand, ...cards],
  };
}

// ============================================================
// SCORING
// ============================================================

/** Calcule les points d'une main */
export function calculateHandPoints(hand: Card[]): number {
  return hand.reduce((total, card) => total + CARD_POINTS[card.value], 0);
}

/** Calcule les scores de fin de manche */
export function calculateRoundScores(players: Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    score: player.score + calculateHandPoints(player.hand),
  }));
}

/** Vérifie si un joueur a dépassé le score cible (il perd) */
export function isEliminated(player: Player, targetScore: number): boolean {
  return player.score >= targetScore;
}

/** Détermine le gagnant (dernier joueur non éliminé, ou celui avec le score le plus bas) */
export function determineWinner(players: Player[], targetScore: number): Player | null {
  const activePlayers = players.filter((p) => !isEliminated(p, targetScore));
  if (activePlayers.length === 1) return activePlayers[0];
  if (activePlayers.length === 0) {
    // Tous éliminés: celui avec le score le plus bas gagne
    return [...players].sort((a, b) => a.score - b.score)[0];
  }
  return null; // Pas encore de gagnant
}

/** Vérifie si un joueur a vidé sa main (gagne la manche) */
export function hasEmptyHand(player: Player): boolean {
  return player.hand.length === 0;
}

// ============================================================
// TOUR MANAGEMENT
// ============================================================

/** Passe au joueur suivant qui a encore des cartes */
export function getNextPlayerIndex(
  currentIndex: number,
  players: Player[]
): number {
  let next = (currentIndex + 1) % players.length;
  let attempts = 0;
  while (!canPlay(players[next]) && attempts < players.length) {
    next = (next + 1) % players.length;
    attempts++;
  }
  return next;
}

// ============================================================
// BOT AI
// ============================================================

/** Stratégie de bot simple pour jouer une carte */
export function botPlayCard(
  bot: Player,
  lastDeclaredValue: CardValue | null
): { cardIndex: number; declaredValue: CardValue } {
  if (bot.hand.length === 0) {
    throw new Error('Le bot n\'a pas de cartes');
  }

  // Si c'est le premier tour ou pas de valeur déclarée, jouer honnêtement
  if (lastDeclaredValue === null) {
    const randomIndex = Math.floor(Math.random() * bot.hand.length);
    return {
      cardIndex: randomIndex,
      declaredValue: bot.hand[randomIndex].value,
    };
  }

  // Chercher une carte avec la valeur requise (ou supérieure)
  const matchingIndex = bot.hand.findIndex(
    (c) => c.value === lastDeclaredValue || c.value > lastDeclaredValue
  );

  if (matchingIndex !== -1) {
    // Jouer honnêtement
    const card = bot.hand[matchingIndex];
    return {
      cardIndex: matchingIndex,
      declaredValue: card.value,
    };
  }

  // Pas de carte valide: bluffer!
  const bluffIndex = Math.floor(Math.random() * bot.hand.length);
  // Déclarer une valeur crédible (la dernière déclarée ou une proche)
  const bluffValue = lastDeclaredValue;

  return {
    cardIndex: bluffIndex,
    declaredValue: bluffValue,
  };
}

/** Décision du bot: contester ou non */
export function botShouldChallenge(
  bot: Player,
  lastPlay: PlayedCard,
  pileSize: number
): boolean {
  // Plus le tas est gros, plus le bot hésite à contester
  const hesitation = Math.min(pileSize * 0.1, 0.5);

  // Compter combien le bot a de la valeur déclarée
  const countInHand = bot.hand.filter(
    (c) => c.value === lastPlay.declaredValue
  ).length;

  // Si le bot a 3+ cartes de cette valeur, le joueur ment probablement
  // (il y en a max 4 dans le paquet)
  if (countInHand >= 3) return Math.random() > hesitation;
  if (countInHand >= 2) return Math.random() > 0.5 + hesitation;

  // Sinon, contester aléatoirement (20% de chance de base)
  return Math.random() > 0.8 + hesitation;
}

// ============================================================
// GAME STATE MANAGEMENT
// ============================================================

/** Crée l'état initial du jeu */
export function createInitialState(
  targetScore: number = DEFAULT_TARGET_SCORE,
  maxRounds: number = DEFAULT_MAX_ROUNDS
): GameState {
  return {
    phase: 'waiting',
    players: [],
    currentPlayerIndex: 0,
    pile: [],
    deck: [],
    lastPlay: null,
    lastChallenge: null,
    currentDeclaredValue: null,
    roundNumber: 0,
    maxRounds,
    targetScore,
    challengeTimer: 0,
    winnerId: null,
  };
}

/** Reducer principal du jeu */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'JOIN': {
      if (state.phase !== 'waiting') return state;
      if (state.players.length >= MAX_PLAYERS) return state;
      if (state.players.find((p) => p.id === action.playerId)) return state;

      const newPlayer: Player = {
        id: action.playerId,
        name: action.playerName,
        hand: [],
        score: 0,
        isBot: action.isBot || false,
        isReady: true,
      };

      return {
        ...state,
        players: [...state.players, newPlayer],
      };
    }

    case 'START_GAME': {
      if (state.players.length < MIN_PLAYERS) return state;

      const deck = createDeck();
      const { players, remainingDeck } = dealCards(state.players, deck);

      return {
        ...state,
        phase: 'playing',
        players,
        deck: remainingDeck,
        currentPlayerIndex: 0,
        pile: [],
        lastPlay: null,
        lastChallenge: null,
        currentDeclaredValue: null,
        roundNumber: state.roundNumber + 1,
      };
    }

    case 'PLAY_CARD': {
      // Pendant 'challenging', seul le joueur SUIVANT peut décider :
      // poser une carte (= renoncer à crier Kdoub) OU appuyer sur Kdoub.
      // Si le joueur suivant pose une carte, on auto-pass et on enchaîne.
      let workingState = state;
      if (state.phase === 'challenging') {
        const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players);
        if (state.players[nextIdx]?.id !== action.playerId) return state;
        workingState = {
          ...state,
          phase: 'playing',
          currentPlayerIndex: nextIdx,
          challengeTimer: 0,
        };
      } else if (state.phase !== 'playing') {
        return state;
      }

      const playerIndex = workingState.players.findIndex(
        (p) => p.id === action.playerId
      );
      if (playerIndex === -1 || playerIndex !== workingState.currentPlayerIndex) {
        return state;
      }

      const player = workingState.players[playerIndex];

      // RÈGLE FONDAMENTALE KDOUB: si une valeur est déjà déclarée dans la
      // séquence en cours, tous les joueurs suivants DOIVENT déclarer la
      // même valeur — on force ici, peu importe ce que le client a envoyé.
      // Seule une contestation Kdoub! ou un nouveau round peut rompre la
      // séquence et autoriser une nouvelle déclaration libre.
      const forcedDeclaredValue: CardValue =
        workingState.currentDeclaredValue !== null
          ? workingState.currentDeclaredValue
          : action.declaredValue;

      const { updatedPlayer, playedCard } = playCard(
        player,
        action.cardIndex,
        forcedDeclaredValue
      );

      const updatedPlayers = [...workingState.players];
      updatedPlayers[playerIndex] = updatedPlayer;

      // Vérifier si le joueur a vidé sa main
      if (hasEmptyHand(updatedPlayer)) {
        // Fin de manche - calculer les scores
        const scoredPlayers = calculateRoundScores(updatedPlayers);
        const winner = determineWinner(scoredPlayers, workingState.targetScore);

        if (winner || workingState.roundNumber >= workingState.maxRounds) {
          return {
            ...workingState,
            phase: 'game_over',
            players: scoredPlayers,
            lastPlay: playedCard,
            pile: [...workingState.pile, playedCard],
            winnerId: winner?.id || scoredPlayers.sort((a, b) => a.score - b.score)[0].id,
          };
        }

        return {
          ...workingState,
          phase: 'round_end',
          players: scoredPlayers,
          lastPlay: playedCard,
          pile: [...workingState.pile, playedCard],
        };
      }

      return {
        ...workingState,
        phase: 'challenging',
        players: updatedPlayers,
        lastPlay: playedCard,
        pile: [...workingState.pile, playedCard],
        currentDeclaredValue: forcedDeclaredValue,
        challengeTimer: CHALLENGE_TIMEOUT_MS,
      };
    }

    case 'CHALLENGE': {
      if (state.phase !== 'challenging' || !state.lastPlay) return state;
      if (action.challengerId === state.lastPlay.playerId) return state;

      const result = resolveChallenge(
        action.challengerId,
        state.lastPlay,
        state.pile
      );

      // Le perdant ramasse le tas
      const loserIndex = state.players.findIndex(
        (p) => p.id === result.loserId
      );
      if (loserIndex === -1) return state;

      const updatedPlayers = [...state.players];
      updatedPlayers[loserIndex] = collectPile(
        updatedPlayers[loserIndex],
        result.cardsCollected
      );

      return {
        ...state,
        phase: 'revealing',
        players: updatedPlayers,
        lastChallenge: result,
        pile: [], // Le tas est vidé
      };
    }

    case 'PASS_CHALLENGE': {
      // Tous passent: pas de contestation, on continue
      if (state.phase !== 'challenging') return state;

      const nextIndex = getNextPlayerIndex(
        state.currentPlayerIndex,
        state.players
      );

      return {
        ...state,
        phase: 'playing',
        currentPlayerIndex: nextIndex,
        challengeTimer: 0,
      };
    }

    case 'NEXT_TURN': {
      if (state.phase !== 'revealing') return state;

      const nextIndex = getNextPlayerIndex(
        state.currentPlayerIndex,
        state.players
      );

      // Une contestation vient d'avoir lieu → la séquence est rompue,
      // le prochain joueur peut déclarer une nouvelle valeur librement.
      return {
        ...state,
        phase: 'playing',
        currentPlayerIndex: nextIndex,
        lastPlay: null,
        lastChallenge: null,
        currentDeclaredValue: null,
        challengeTimer: 0,
      };
    }

    case 'NEW_ROUND': {
      if (state.phase !== 'round_end') return state;

      const deck = createDeck();
      const resetPlayers = state.players.map((p) => ({
        ...p,
        hand: [],
      }));
      const { players, remainingDeck } = dealCards(resetPlayers, deck);

      return {
        ...state,
        phase: 'playing',
        players,
        deck: remainingDeck,
        currentPlayerIndex: 0,
        pile: [],
        lastPlay: null,
        lastChallenge: null,
        currentDeclaredValue: null,
        roundNumber: state.roundNumber + 1,
      };
    }

    case 'RESET': {
      return createInitialState(state.targetScore, state.maxRounds);
    }

    default:
      return state;
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Obtenir le joueur actuel */
export function getCurrentPlayer(state: GameState): Player | null {
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= state.players.length) {
    return null;
  }
  return state.players[state.currentPlayerIndex];
}

/** Vérifie si c'est le tour d'un joueur donné */
export function isPlayerTurn(state: GameState, playerId: string): boolean {
  const current = getCurrentPlayer(state);
  return current?.id === playerId;
}

/** Nombre de cartes restantes pour un joueur */
export function getPlayerCardCount(state: GameState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  return player?.hand.length ?? 0;
}

/** Formater une carte pour l'affichage */
export function formatCard(card: Card): string {
  return `${VALUE_NAMES[card.value]} de ${SUIT_NAMES[card.suit]}`;
}

/** Formater une valeur déclarée */
export function formatDeclaredValue(value: CardValue): string {
  return VALUE_NAMES[value];
}

/** Créer des bots pour remplir la partie */
export function createBots(count: number): GameAction[] {
  const botNames = ['Hamza', 'Fatima', 'Youssef', 'Amina', 'Omar'];
  return Array.from({ length: Math.min(count, botNames.length) }, (_, i) => ({
    type: 'JOIN' as const,
    playerId: `bot-${i + 1}`,
    playerName: botNames[i],
    isBot: true,
  }));
}
