import { GameType, GameStatus, Player } from '@sally/types';
import { GameEngine, ValidationResult, GameEvent } from '../../game-engine.base';
import { OkeyState, OkeyMove, OkeyConfig, OkeyTile } from './okey.types';

const OKEY_COLORS: OkeyTile['color'][] = ['red', 'blue', 'green', 'black'];

/**
 * Create the full set of 106 Okey tiles:
 * 4 colors x 13 values x 2 copies + 2 false jokers
 */
function createOkeyTiles(): OkeyTile[] {
  const tiles: OkeyTile[] = [];
  let idCounter = 0;

  for (let copy = 0; copy < 2; copy++) {
    for (const color of OKEY_COLORS) {
      for (let value = 1; value <= 13; value++) {
        tiles.push({
          id: `okey-${color}-${value}-${copy}`,
          color,
          value,
          isJoker: false,
        });
        idCounter++;
      }
    }
  }

  // 2 false jokers
  tiles.push({
    id: `okey-joker-0`,
    color: 'red',
    value: 0,
    isJoker: true,
  });
  tiles.push({
    id: `okey-joker-1`,
    color: 'red',
    value: 0,
    isJoker: true,
  });

  return tiles;
}

/**
 * Shuffle an array using Fisher-Yates.
 */
function shuffleTiles(tiles: OkeyTile[]): OkeyTile[] {
  const arr = [...tiles];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cloneState(state: OkeyState): OkeyState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    tiles: state.tiles.map((t) => ({ ...t })),
    drawPile: state.drawPile.map((t) => ({ ...t })),
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([k, v]) => [k, v.map((t) => ({ ...t }))])
    ),
    discardPiles: Object.fromEntries(
      Object.entries(state.discardPiles).map(([k, v]) => [
        k,
        v.map((t) => ({ ...t })),
      ])
    ),
    okeyTile: { ...state.okeyTile },
  };
}

/**
 * Determine the okey (wild) tile based on a revealed indicator tile.
 * The okey tile is the tile with the same color and value + 1
 * (wrapping 13 -> 1).
 */
function determineOkeyTile(indicator: OkeyTile): OkeyTile {
  const okeyValue = indicator.value === 13 ? 1 : indicator.value + 1;
  return {
    id: 'okey-indicator',
    color: indicator.color,
    value: okeyValue,
    isJoker: false,
  };
}

/**
 * Check if a tile matches the okey (wild) definition.
 * A tile is wild if:
 * - It is a false joker, OR
 * - It matches the okey tile's color and value
 */
function isWild(tile: OkeyTile, okeyTile: OkeyTile): boolean {
  if (tile.isJoker) return true;
  return tile.color === okeyTile.color && tile.value === okeyTile.value;
}

/**
 * Validate whether a hand of 14 tiles can be decomposed into valid groups.
 * Valid groups are:
 * - Runs: 3+ consecutive same-color tiles (1-2-3, 11-12-13, etc.)
 *   Note: no wrapping (13-1-2 is NOT valid)
 * - Sets: 3-4 same-value different-color tiles
 * Wild tiles (okey or false jokers) can substitute for any tile.
 */
export function isValidHand(tiles: OkeyTile[], okeyTile: OkeyTile): boolean {
  if (tiles.length !== 14) return false;

  // Separate wild tiles from normal tiles
  const wilds: OkeyTile[] = [];
  const normals: OkeyTile[] = [];

  for (const tile of tiles) {
    if (isWild(tile, okeyTile)) {
      wilds.push(tile);
    } else {
      normals.push(tile);
    }
  }

  // Try all possible decompositions using backtracking
  return canDecompose(normals, wilds.length);
}

/**
 * Backtracking solver: try to decompose normal tiles + wildCount wilds
 * into valid groups that cover all tiles.
 */
function canDecompose(tiles: OkeyTile[], wildCount: number): boolean {
  if (tiles.length === 0 && wildCount === 0) return true;
  if (tiles.length + wildCount < 3) return false;

  // Sort tiles by color then value for consistent processing
  const sorted = [...tiles].sort((a, b) => {
    if (a.color !== b.color) return a.color.localeCompare(b.color);
    return a.value - b.value;
  });

  // Try forming a group starting from the first tile
  const first = sorted[0];
  const remaining = sorted.slice(1);

  // Strategy 1: Try to form a SET (same value, different colors)
  const setResults = tryFormSet(first, remaining, wildCount);
  for (const result of setResults) {
    if (canDecompose(result.remaining, result.wildCount)) return true;
  }

  // Strategy 2: Try to form a RUN (consecutive same color)
  const runResults = tryFormRun(first, remaining, wildCount);
  for (const result of runResults) {
    if (canDecompose(result.remaining, result.wildCount)) return true;
  }

  // Strategy 3: If there are wilds, try using a wild with two tiles to form groups
  // (The wild takes the place of 'first' in some group, so first goes back to remaining)
  if (wildCount > 0) {
    // Try using a wild to substitute for first tile (skip it, use wild instead)
    // Actually this is equivalent to trying all groups without first and with first deferred
    // This is handled by trying wild-augmented sets and runs above
  }

  return false;
}

interface DecomposeResult {
  remaining: OkeyTile[];
  wildCount: number;
}

/**
 * Try to form sets (same value, different colors) that include the given tile.
 * Returns all possible ways to form a valid set containing this tile.
 */
function tryFormSet(
  tile: OkeyTile,
  otherTiles: OkeyTile[],
  wildCount: number
): DecomposeResult[] {
  const results: DecomposeResult[] = [];

  // Find all tiles with the same value but different colors
  const sameValue = otherTiles.filter(
    (t) => t.value === tile.value && t.color !== tile.color
  );

  // Remove duplicates of the same color (keep one per color)
  const byColor = new Map<string, OkeyTile[]>();
  for (const t of sameValue) {
    if (!byColor.has(t.color)) byColor.set(t.color, []);
    byColor.get(t.color)!.push(t);
  }

  const availableColors = Array.from(byColor.keys());

  // Generate combinations of 2+ same-value tiles (+ the first tile = 3+ total)
  // Also allow wilds to fill gaps

  // Try sets of size 3 and 4
  for (let setSize = 3; setSize <= 4; setSize++) {
    const needFromOthers = setSize - 1; // first tile is already included

    // Try all combinations of available colors + wilds
    generateSetCombos(
      availableColors,
      byColor,
      needFromOthers,
      wildCount,
      otherTiles,
      results
    );
  }

  return results;
}

function generateSetCombos(
  availableColors: string[],
  byColor: Map<string, OkeyTile[]>,
  need: number,
  wildCount: number,
  allOtherTiles: OkeyTile[],
  results: DecomposeResult[]
): void {
  // We need 'need' tiles total from colors + wilds
  // min wilds = max(0, need - availableColors.length)
  // max wilds = min(need, wildCount)

  const minWilds = Math.max(0, need - availableColors.length);
  const maxWilds = Math.min(need, wildCount);

  for (let w = minWilds; w <= maxWilds; w++) {
    const colorsNeeded = need - w;
    if (colorsNeeded > availableColors.length) continue;

    // Choose colorsNeeded colors from availableColors
    const colorCombos = combinations(availableColors, colorsNeeded);

    for (const chosenColors of colorCombos) {
      // Check that all chosen colors are different (they are by construction)
      // Pick one tile from each color
      const usedTileIds = new Set<string>();
      const usedTiles: OkeyTile[] = [];
      let valid = true;

      for (const color of chosenColors) {
        const colorTiles = byColor.get(color)!;
        const available = colorTiles.find((t) => !usedTileIds.has(t.id));
        if (!available) {
          valid = false;
          break;
        }
        usedTiles.push(available);
        usedTileIds.add(available.id);
      }

      if (!valid) continue;

      // Remove used tiles from remaining
      const remaining = allOtherTiles.filter((t) => !usedTileIds.has(t.id));
      results.push({ remaining, wildCount: wildCount - w });
    }
  }
}

/**
 * Try to form runs (consecutive same-color) that include the given tile.
 */
function tryFormRun(
  tile: OkeyTile,
  otherTiles: OkeyTile[],
  wildCount: number
): DecomposeResult[] {
  const results: DecomposeResult[] = [];
  const color = tile.color;

  // Get all same-color tiles sorted by value
  const sameColor = otherTiles
    .filter((t) => t.color === color)
    .sort((a, b) => a.value - b.value);

  // Try runs of length 3 to max possible
  const maxLen = Math.min(13, sameColor.length + 1 + wildCount);

  for (let runLen = 3; runLen <= maxLen; runLen++) {
    // Try all starting values where tile.value is within the run
    const minStart = Math.max(1, tile.value - runLen + 1);
    const maxStart = Math.min(13 - runLen + 1, tile.value);

    for (let start = minStart; start <= maxStart; start++) {
      // Build the run from start to start+runLen-1
      const runValues: number[] = [];
      for (let v = start; v < start + runLen; v++) {
        runValues.push(v);
      }

      // tile.value must be in the run
      if (!runValues.includes(tile.value)) continue;

      // For each value in the run (except tile.value), find a matching tile or use a wild
      let wildsUsed = 0;
      const usedTileIds = new Set<string>();
      let valid = true;

      for (const val of runValues) {
        if (val === tile.value && !usedTileIds.has('__first__')) {
          // Use the first tile for this position
          usedTileIds.add('__first__');
          continue;
        }

        // Find a same-color tile with this value
        const match = sameColor.find(
          (t) => t.value === val && !usedTileIds.has(t.id)
        );
        if (match) {
          usedTileIds.add(match.id);
        } else {
          wildsUsed++;
          if (wildsUsed > wildCount) {
            valid = false;
            break;
          }
        }
      }

      if (!valid) continue;

      // Handle case where tile.value appears multiple times in the run
      // (this can't happen since values are unique in a run)

      usedTileIds.delete('__first__');
      const remaining = otherTiles.filter((t) => !usedTileIds.has(t.id));
      results.push({ remaining, wildCount: wildCount - wildsUsed });
    }
  }

  return results;
}

/**
 * Generate all k-combinations of an array.
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];

  const results: T[][] = [];

  function backtrack(start: number, current: T[]): void {
    if (current.length === k) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return results;
}

export class OkeyEngine extends GameEngine<OkeyState, OkeyMove, OkeyConfig> {
  readonly gameType = GameType.OKEY;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  initialize(
    players: Player[],
    config: Partial<OkeyConfig> = {}
  ): OkeyState {
    if (players.length < 2 || players.length > 4) {
      throw new Error('Okey requires 2-4 players');
    }

    const allTiles = shuffleTiles(createOkeyTiles());

    // Reveal one tile to determine the okey
    const indicatorTile = allTiles.pop()!;
    const okeyTile = determineOkeyTile(indicatorTile);

    // Deal tiles: 15 to first player (dealer), 14 to others
    const hands: Record<string, OkeyTile[]> = {};
    const discardPiles: Record<string, OkeyTile[]> = {};
    let remaining = [...allTiles];

    // First player gets 15
    hands[players[0].id] = remaining.splice(0, 15);
    discardPiles[players[0].id] = [];

    // Others get 14
    for (let i = 1; i < players.length; i++) {
      hands[players[i].id] = remaining.splice(0, 14);
      discardPiles[players[i].id] = [];
    }

    return {
      id: `okey-${Date.now()}`,
      type: GameType.OKEY,
      status: GameStatus.IN_PROGRESS,
      players: [...players],
      currentPlayerId: players[0].id,
      turnNumber: 0,
      phase: 'playing',
      createdAt: Date.now(),
      tiles: createOkeyTiles(),
      hands,
      drawPile: remaining,
      discardPiles,
      okeyTile,
      hasDrawn: true, // First player starts with 15 tiles, so they skip drawing
      winner: null,
    };
  }

  validateMove(
    state: OkeyState,
    move: OkeyMove,
    playerId: string
  ): ValidationResult {
    if (state.phase === 'ended') {
      return { valid: false, reason: 'Game is over' };
    }
    if (playerId !== state.currentPlayerId) {
      return { valid: false, reason: 'Not your turn' };
    }

    const hand = state.hands[playerId];

    switch (move.type) {
      case 'drawFromPile': {
        if (state.hasDrawn) {
          return { valid: false, reason: 'Already drew a tile this turn' };
        }
        if (state.drawPile.length === 0) {
          return { valid: false, reason: 'Draw pile is empty' };
        }
        return { valid: true };
      }

      case 'drawFromDiscard': {
        if (state.hasDrawn) {
          return { valid: false, reason: 'Already drew a tile this turn' };
        }
        // Can only draw from previous player's discard pile
        const playerIndex = state.players.findIndex((p) => p.id === playerId);
        const prevIndex =
          (playerIndex - 1 + state.players.length) % state.players.length;
        const prevPlayerId = state.players[prevIndex].id;

        if (move.fromPlayerId !== prevPlayerId) {
          return {
            valid: false,
            reason: 'Can only draw from previous player discard pile',
          };
        }
        const discardPile = state.discardPiles[prevPlayerId];
        if (!discardPile || discardPile.length === 0) {
          return { valid: false, reason: 'Discard pile is empty' };
        }
        return { valid: true };
      }

      case 'discard': {
        if (!state.hasDrawn) {
          return { valid: false, reason: 'Must draw a tile before discarding' };
        }
        const tile = hand.find((t) => t.id === move.tileId);
        if (!tile) {
          return { valid: false, reason: 'Tile not in hand' };
        }
        // After discarding, hand should have 14 tiles (currently 15)
        if (hand.length !== 15) {
          return {
            valid: false,
            reason: 'Hand must have 15 tiles before discarding',
          };
        }
        return { valid: true };
      }

      case 'declare': {
        if (!state.hasDrawn) {
          return { valid: false, reason: 'Must draw a tile before declaring' };
        }
        // Player must have exactly 15 tiles; they declare with 14 (choosing which to discard implicitly)
        // Actually, declare uses all 14 tiles in groups -- the 15th is discarded
        if (hand.length !== 15) {
          return {
            valid: false,
            reason: 'Hand must have 15 tiles to declare',
          };
        }

        // Flatten all tile IDs in the declared groups
        const declaredIds = move.groups.flat();
        if (declaredIds.length !== 14) {
          return {
            valid: false,
            reason: 'Must declare exactly 14 tiles in groups',
          };
        }

        // All declared tiles must be in hand
        for (const tileId of declaredIds) {
          if (!hand.some((t) => t.id === tileId)) {
            return { valid: false, reason: `Tile ${tileId} not in hand` };
          }
        }

        // No duplicate IDs
        if (new Set(declaredIds).size !== 14) {
          return { valid: false, reason: 'Duplicate tiles in declaration' };
        }

        // Resolve tiles
        const declaredTiles = declaredIds.map(
          (id) => hand.find((t) => t.id === id)!
        );

        // Validate the hand
        if (!isValidHand(declaredTiles, state.okeyTile)) {
          return { valid: false, reason: 'Invalid hand arrangement' };
        }

        // Validate each group individually
        for (const group of move.groups) {
          if (group.length < 3) {
            return {
              valid: false,
              reason: 'Each group must have at least 3 tiles',
            };
          }
          const groupTiles = group.map((id) => hand.find((t) => t.id === id)!);
          if (!isValidGroup(groupTiles, state.okeyTile)) {
            return { valid: false, reason: 'Invalid group in declaration' };
          }
        }

        return { valid: true };
      }

      default:
        return { valid: false, reason: 'Unknown move type' };
    }
  }

  applyMove(
    state: OkeyState,
    move: OkeyMove,
    playerId: string
  ): { state: OkeyState; events: GameEvent[] } {
    const newState = cloneState(state);
    const events: GameEvent[] = [];

    switch (move.type) {
      case 'drawFromPile': {
        const tile = newState.drawPile.shift()!;
        newState.hands[playerId].push(tile);
        newState.hasDrawn = true;

        events.push({
          type: 'tileDrawn',
          playerId,
          payload: { source: 'pile', tile },
          timestamp: Date.now(),
        });
        break;
      }

      case 'drawFromDiscard': {
        const playerIndex = newState.players.findIndex(
          (p) => p.id === playerId
        );
        const prevIndex =
          (playerIndex - 1 + newState.players.length) %
          newState.players.length;
        const prevPlayerId = newState.players[prevIndex].id;
        const tile = newState.discardPiles[prevPlayerId].pop()!;
        newState.hands[playerId].push(tile);
        newState.hasDrawn = true;

        events.push({
          type: 'tileDrawn',
          playerId,
          payload: { source: 'discard', fromPlayerId: prevPlayerId, tile },
          timestamp: Date.now(),
        });
        break;
      }

      case 'discard': {
        const tileIndex = newState.hands[playerId].findIndex(
          (t) => t.id === move.tileId
        );
        const [tile] = newState.hands[playerId].splice(tileIndex, 1);
        newState.discardPiles[playerId].push(tile);
        newState.hasDrawn = false;
        newState.turnNumber++;

        events.push({
          type: 'tileDiscarded',
          playerId,
          payload: { tile },
          timestamp: Date.now(),
        });

        // Advance to next player
        const currentIdx = newState.players.findIndex(
          (p) => p.id === playerId
        );
        const nextIdx = (currentIdx + 1) % newState.players.length;
        newState.currentPlayerId = newState.players[nextIdx].id;

        // Check if draw pile is empty - game ends in a draw
        if (
          newState.drawPile.length === 0 &&
          newState.discardPiles[playerId].length === 0
        ) {
          // If there's nothing to draw, game is a stalemate
          // Actually, player can still draw from discard pile, so only end if truly stuck
        }

        break;
      }

      case 'declare': {
        // The 15th tile (not in groups) is discarded
        const declaredIds = new Set(move.groups.flat());
        const discardTile = newState.hands[playerId].find(
          (t) => !declaredIds.has(t.id)
        )!;

        newState.discardPiles[playerId].push({ ...discardTile });
        newState.hands[playerId] = newState.hands[playerId].filter((t) =>
          declaredIds.has(t.id)
        );
        newState.phase = 'ended';
        newState.status = GameStatus.FINISHED;
        newState.winner = playerId;
        newState.turnNumber++;

        events.push({
          type: 'handDeclared',
          playerId,
          payload: { groups: move.groups, discardedTile: discardTile },
          timestamp: Date.now(),
        });

        events.push({
          type: 'gameOver',
          playerId,
          payload: { winner: playerId },
          timestamp: Date.now(),
        });
        break;
      }
    }

    return { state: newState, events };
  }

  calculateScore(state: OkeyState): Map<string, number> {
    const scores = new Map<string, number>();
    for (const player of state.players) {
      if (state.winner === player.id) {
        scores.set(player.id, 1);
      } else {
        scores.set(player.id, 0);
      }
    }
    return scores;
  }

  isGameOver(state: OkeyState): boolean {
    return state.phase === 'ended';
  }

  getWinner(state: OkeyState): string | null {
    return state.winner;
  }

  getValidMoves(state: OkeyState, playerId: string): OkeyMove[] {
    if (playerId !== state.currentPlayerId) return [];
    if (state.phase !== 'playing') return [];

    const moves: OkeyMove[] = [];
    const hand = state.hands[playerId];

    if (!state.hasDrawn) {
      // Must draw first
      if (state.drawPile.length > 0) {
        moves.push({ type: 'drawFromPile' });
      }

      // Can draw from previous player's discard
      const playerIndex = state.players.findIndex((p) => p.id === playerId);
      const prevIndex =
        (playerIndex - 1 + state.players.length) % state.players.length;
      const prevPlayerId = state.players[prevIndex].id;
      if (
        state.discardPiles[prevPlayerId] &&
        state.discardPiles[prevPlayerId].length > 0
      ) {
        moves.push({ type: 'drawFromDiscard', fromPlayerId: prevPlayerId });
      }
    } else {
      // Must discard (hand has 15 tiles)
      for (const tile of hand) {
        moves.push({ type: 'discard', tileId: tile.id });
      }

      // Can also declare if hand is valid
      // We don't enumerate all possible groupings here -- just indicate that
      // declare is possible. The client must construct the groups.
      // Check if any valid 14-tile subset exists
      if (hand.length === 15) {
        // Try removing each tile and checking if the remaining 14 form a valid hand
        for (let i = 0; i < hand.length; i++) {
          const subset = [...hand.slice(0, i), ...hand.slice(i + 1)];
          if (isValidHand(subset, state.okeyTile)) {
            // We don't enumerate the exact group decomposition here
            // The player needs to provide the groups in their declare move
            moves.push({ type: 'declare', groups: [] });
            break; // Just indicate declare is available once
          }
        }
      }
    }

    return moves;
  }

  getCurrentPlayerId(state: OkeyState): string {
    return state.currentPlayerId;
  }
}

/**
 * Check if a single group of tiles is a valid run or set.
 */
function isValidGroup(tiles: OkeyTile[], okeyTile: OkeyTile): boolean {
  if (tiles.length < 3) return false;

  const wilds: OkeyTile[] = [];
  const normals: OkeyTile[] = [];

  for (const tile of tiles) {
    if (isWild(tile, okeyTile)) {
      wilds.push(tile);
    } else {
      normals.push(tile);
    }
  }

  // Try as a set
  if (isValidSet(normals, wilds.length, tiles.length)) return true;

  // Try as a run
  if (isValidRun(normals, wilds.length, tiles.length)) return true;

  return false;
}

/**
 * Check if normal tiles + wilds can form a valid set.
 * A set: 3-4 tiles of the same value, all different colors.
 */
function isValidSet(
  normals: OkeyTile[],
  wildCount: number,
  totalSize: number
): boolean {
  if (totalSize < 3 || totalSize > 4) return false;

  // All normals must have the same value
  if (normals.length > 0) {
    const val = normals[0].value;
    if (!normals.every((t) => t.value === val)) return false;
  }

  // All normals must have different colors
  const colors = new Set(normals.map((t) => t.color));
  if (colors.size !== normals.length) return false;

  // Total (normals + wilds) must be 3 or 4
  // Wilds fill in for missing colors
  return normals.length + wildCount === totalSize;
}

/**
 * Check if normal tiles + wilds can form a valid run.
 * A run: 3+ consecutive tiles of the same color.
 */
function isValidRun(
  normals: OkeyTile[],
  wildCount: number,
  totalSize: number
): boolean {
  if (totalSize < 3) return false;

  if (normals.length === 0) {
    // All wilds -- valid as a run of any 3+ consecutive tiles
    return wildCount >= 3;
  }

  // All normals must be the same color
  const color = normals[0].color;
  if (!normals.every((t) => t.color === color)) return false;

  // Sort by value
  const sorted = [...normals].sort((a, b) => a.value - b.value);

  // Check for duplicate values
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].value === sorted[i - 1].value) return false;
  }

  // The run spans from some start to start + totalSize - 1
  // The normals must fit within this range, and wilds fill gaps
  const minVal = sorted[0].value;
  const maxVal = sorted[sorted.length - 1].value;

  // The minimum run length to cover all normals
  const span = maxVal - minVal + 1;

  // We need enough tiles (normals + wilds) to fill the span
  // The run size could be larger than span (extending before or after)
  // But the most natural is exactly totalSize
  if (span > totalSize) return false;

  // Count gaps in the normal tiles
  const gaps = span - normals.length;
  if (gaps > wildCount) return false;

  // The run has totalSize tiles. Normals cover 'span' positions.
  // Remaining wilds can extend the run.
  const remainingWilds = wildCount - gaps;
  const actualSize = span + remainingWilds;

  // The total must match
  if (actualSize !== totalSize) return false;

  // Ensure the run doesn't go out of bounds (1-13)
  // The run could extend before minVal or after maxVal
  // At minimum: start = minVal - some extension, end = maxVal + some extension
  // We need start >= 1 and end <= 13
  const extraBefore = Math.min(remainingWilds, minVal - 1);
  const extraAfter = remainingWilds - extraBefore;
  if (maxVal + extraAfter > 13) {
    // Try distributing differently
    const maxExtraAfter = 13 - maxVal;
    const neededExtraBefore = remainingWilds - maxExtraAfter;
    if (neededExtraBefore > minVal - 1) return false;
  }

  return true;
}
