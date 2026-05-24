import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Résout l'URL de l'API dynamiquement :
 *   1. Si EXPO_PUBLIC_API_URL est défini → l'utilise tel quel
 *   2. Sinon, utilise l'IP de Metro (debuggerHost) + port 3000
 *      → l'IP suit automatiquement le Wi-Fi (pas besoin d'éditer .env)
 *   3. Fallback localhost pour le web ou quand rien n'est détecté
 */
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // hostUri ressemble à "192.168.1.12:8081" en dev
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return `http://${host}:3000/api/v1`;
  }
  return 'http://localhost:3000/api/v1';
}

const API_URL = resolveApiUrl();

/** Même logique pour le socket-server (port 3001). */
function resolveSocketUrl(): string {
  if (process.env.EXPO_PUBLIC_SOCKET_URL) {
    return process.env.EXPO_PUBLIC_SOCKET_URL;
  }
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return `http://${host}:3001`;
  }
  return 'http://localhost:3001';
}

export const SOCKET_URL = resolveSocketUrl();

/** URL live du socket-server — pour les écrans temps réel (parité belote). */
export function getSocketUrl(): string { return resolveSocketUrl(); }

if (__DEV__) {
  console.log('[api] API →', API_URL);
  console.log('[api] Socket →', SOCKET_URL);
}

// In-memory token storage
let authToken: string | null = null;
let refreshToken: string | null = null;

export interface User {
  id: string;
  email: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  teamWinRate: number;
  rank: number;
  coins: number;
  achievements: number;
  memberSince: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
}

export interface Room {
  code: string;
  gameType: string;
  status: 'waiting' | 'playing' | 'finished';
  playersCount: number;
  playersMax: number;
  createdAt: string;
}

export interface Bot {
  id: string;
  name: string;
  level: 'easy' | 'medium' | 'hard' | 'expert';
}

// Utility function to handle fetch with error handling
async function fetchWithToken(
  endpoint: string,
  options: RequestInit = {}
) {
  const url = `${API_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = `API error: ${response.status}`;
      try {
        const errorData = await response.json();
        // API error format: { error: { message } } or { message }
        if (errorData.error?.message) message = errorData.error.message;
        else if (errorData.message) message = errorData.message;
      } catch {}
      throw new Error(message);
    }

    const json = await response.json();
    // API wraps responses in { success, data, timestamp } — unwrap
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
    throw error;
  }
}

// Authentication APIs
export async function login(email: string, password: string, options?: { gameType?: string }) {
  try {
    const data = await fetchWithToken('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, gameType: options?.gameType }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    return data;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

/**
 * Google Sign-In : envoie l'id_token Google au backend (/auth/google),
 * qui le verifie via Google tokeninfo et retourne les tokens JWT SallyCards.
 */
export async function loginWithGoogle(
  idToken: string,
  options?: { gameType?: string }
) {
  try {
    const data = await fetchWithToken('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken, gameType: options?.gameType ?? 'kdoub' }),
    });
    if (data.accessToken) authToken = data.accessToken;
    if (data.refreshToken) refreshToken = data.refreshToken;
    return data;
  } catch (error) {
    console.error('Google login failed:', error);
    throw error;
  }
}

export async function register(
  email: string,
  username: string,
  password: string
) {
  try {
    const data = await fetchWithToken('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    return data;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

export async function getMe(): Promise<User> {
  try {
    const data = await fetchWithToken('/users/me', {
      method: 'GET',
    });
    return data;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    throw error;
  }
}

export async function refreshTokenAsync(): Promise<{ token: string }> {
  try {
    const data = await fetchWithToken('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    return data;
  } catch (error) {
    console.error('Token refresh failed:', error);
    authToken = null;
    refreshToken = null;
    throw error;
  }
}

export async function logout() {
  authToken = null;
  refreshToken = null;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null, refresh?: string | null) {
  authToken = token;
  if (refresh !== undefined) {
    refreshToken = refresh;
  }
}

// Guest session
export async function createGuestSession(): Promise<{ token: string }> {
  try {
    const data = await fetchWithToken('/auth/guest', {
      method: 'POST',
    });

    if (data.accessToken) {
      authToken = data.accessToken;
    }
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    return data;
  } catch (error) {
    console.error('Failed to create guest session:', error);
    throw error;
  }
}

// Players API — fetch players for a specific game
export async function getPlayers(gameType: string): Promise<any[]> {
  try {
    const data = await fetchWithToken(`/users/by-game/${gameType}`, { method: 'GET' });
    return Array.isArray(data) ? data : (data.users || []);
  } catch (error) {
    console.error(`Failed to fetch players for ${gameType}:`, error);
    return [];
  }
}

// Leaderboard APIs
export async function getLeaderboard(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season',
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}?filter=${filter}&limit=${limit}`,
      { method: 'GET' }
    );
    return data.entries || [];
  } catch (error) {
    console.error(`Failed to fetch leaderboard for ${gameType}:`, error);
    return [];
  }
}

export async function getMyRank(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season'
): Promise<{ rank: number; elo: number; percentile: number }> {
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}/my-rank?filter=${filter}`,
      { method: 'GET' }
    );
    return data;
  } catch (error) {
    console.error(`Failed to fetch rank for ${gameType}:`, error);
    return { rank: 0, elo: 0, percentile: 0 };
  }
}

// Room APIs
export async function createRoom(
  gameType: string,
  config: {
    isPrivate?: boolean;
    maxPlayers?: number;
    botDifficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  } = {}
): Promise<Room> {
  try {
    const data = await fetchWithToken('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        gameType,
        ...config,
      }),
    });
    return data;
  } catch (error) {
    console.error('Failed to create room:', error);
    throw error;
  }
}

export async function listRooms(gameType: string): Promise<Room[]> {
  try {
    const data = await fetchWithToken(`/rooms?gameType=${gameType}`, {
      method: 'GET',
    });
    return data.rooms || [];
  } catch (error) {
    console.error('Failed to list rooms:', error);
    return [];
  }
}

export async function joinRoom(code: string): Promise<Room> {
  try {
    const data = await fetchWithToken(`/rooms/${code}/join`, {
      method: 'POST',
    });
    return data;
  } catch (error) {
    console.error('Failed to join room:', error);
    throw error;
  }
}

export async function leaveRoom(code: string): Promise<void> {
  try {
    await fetchWithToken(`/rooms/${code}/leave`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Failed to leave room:', error);
    throw error;
  }
}

// Bot APIs
export async function listBots(): Promise<Bot[]> {
  try {
    const data = await fetchWithToken('/bots', {
      method: 'GET',
    });
    return data.bots || [];
  } catch (error) {
    console.error('Failed to fetch bots:', error);
    return [];
  }
}

// Update profile
export async function updateProfile(updates: Partial<User>): Promise<User> {
  try {
    const data = await fetchWithToken('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data;
  } catch (error) {
    console.error('Failed to update profile:', error);
    throw error;
  }
}

// ──────────────────────────────────────────────
// Extended Leaderboard (world / country / city)
// ──────────────────────────────────────────────

export async function getLeaderboardScoped(
  gameType: string,
  filter: 'season' | 'weekly' | 'allTime' = 'season',
  scope: 'world' | 'country' | 'city' = 'world',
  limit = 50,
): Promise<{ entries: LeaderboardEntry[]; scope: string; filter: string; total: number }> {
  try {
    const data = await fetchWithToken(
      `/leaderboards/${gameType}?filter=${filter}&scope=${scope}&limit=${limit}`,
      { method: 'GET' },
    );
    return {
      entries: data.entries || [],
      scope: data.scope || scope,
      filter: data.filter || filter,
      total: data.total || 0,
    };
  } catch (e) {
    console.error(`getLeaderboardScoped(${gameType}, ${scope}) failed`, e);
    return { entries: [], scope, filter, total: 0 };
  }
}

// ──────────────────────────────────────────────
// Rooms (create / list / join / ready / start)
// ──────────────────────────────────────────────

export interface RoomFull {
  code: string;
  hostId: string;
  gameType: string;
  status: 'waiting' | 'starting' | 'in_progress' | 'finished';
  mode: 'public' | 'private' | 'ranked';
  maxPlayers: number;
  minPlayers: number;
  playersCount: number;
  players: Array<{ userId: string; username: string; isReady: boolean; isHost?: boolean; joinedAt: string }>;
  config: Record<string, any>;
  shareUrl: string;
  createdAt: string;
}

export async function createRoomFull(
  gameType: string,
  opts: { isPrivate?: boolean; maxPlayers?: number; minPlayers?: number; stake?: number } = {},
): Promise<RoomFull> {
  return fetchWithToken('/rooms', {
    method: 'POST',
    body: JSON.stringify({ gameType, ...opts }),
  });
}

export async function listRoomsFull(gameType?: string): Promise<{ rooms: RoomFull[]; total: number }> {
  const q = gameType ? `?gameType=${gameType}` : '';
  return fetchWithToken(`/rooms${q}`, { method: 'GET' });
}

export async function findRoomByCode(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}`, { method: 'GET' });
}

export async function joinRoomFull(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/join`, { method: 'POST' });
}

export async function leaveRoomFull(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/leave`, { method: 'POST' });
}

export async function setReady(code: string, isReady: boolean): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/ready`, {
    method: 'POST',
    body: JSON.stringify({ isReady }),
  });
}

export async function startGame(code: string): Promise<RoomFull> {
  return fetchWithToken(`/rooms/${code.toUpperCase()}/start`, { method: 'POST' });
}

/**
 * Simulation mode — creates a room pre-filled with `userCount` random
 * users from the DB as "bots" that will auto-play once the game starts.
 */
export async function simulateRoom(gameType: string, userCount: number): Promise<RoomFull> {
  return fetchWithToken('/rooms/simulate', {
    method: 'POST',
    body: JSON.stringify({ gameType, userCount }),
  });
}

// ──────────────────────────────────────────────
// Bots (local vs-bot mode)
// ──────────────────────────────────────────────

export async function botMove(
  gameType: string,
  state: { hand: string[]; table?: string[]; history?: any[]; lockedCards?: string[]; rules?: string },
  difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium',
): Promise<{ card: string | null; action: string; confidence: number; reasoning?: string }> {
  return fetchWithToken(`/bots/${gameType}/move`, {
    method: 'POST',
    body: JSON.stringify({ difficulty, state }),
  });
}

// ──────────────────────────────────────────────
// Shop
// ──────────────────────────────────────────────

export interface ShopPackage {
  productId: string;
  name: string;
  coins: number;
  bonus: number;
  priceEur: number;
  priceUsd: number;
  icon: string;
  gradient: [string, string];
  sortOrder: number;
  popular?: boolean;
  bestValue?: boolean;
  subscription?: boolean;
  durationDays?: number;
}

export async function getShopPackages(): Promise<ShopPackage[]> {
  try {
    const data = await fetchWithToken('/shop/packages', { method: 'GET' });
    return Array.isArray(data) ? data : data.packages || [];
  } catch (e) {
    console.error('getShopPackages failed', e);
    return [];
  }
}

export async function confirmPurchase(
  gameType: string,
  productId: string,
  purchaseId: string,
  platform: 'android' | 'ios',
): Promise<{ amount: number; newBalance: number; pkg: any }> {
  return fetchWithToken('/shop/purchase/confirm', {
    method: 'POST',
    body: JSON.stringify({ gameType, productId, purchaseId, platform }),
  });
}

// ──────────────────────────────────────────────
// Daily Challenge
// ──────────────────────────────────────────────

export async function getDailyChallenge(gameType: string): Promise<any> {
  try {
    return await fetchWithToken(`/challenges/daily/${gameType}`, { method: 'GET' });
  } catch (e: any) {
    // 404 = backend hasn't created today's challenge yet; return a local
    // default so the UI still renders a valid daily card.
    const isMissing = /not found|no challenge/i.test(e?.message || '');
    if (isMissing) {
      return {
        gameType,
        title: 'Défi du jour',
        description: 'Gagne 3 parties consécutives pour empocher le bonus',
        rewardCoins: 50,
        rewardXp: 100,
        active: true,
        participants: [],
        date: new Date().toISOString(),
        fallback: true,
      };
    }
    console.error('getDailyChallenge failed', e);
    return null;
  }
}

export async function joinDailyChallenge(gameType: string): Promise<RoomFull> {
  return fetchWithToken(`/challenges/daily/${gameType}/matchmake`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Games (stat sync at end of match)
// ──────────────────────────────────────────────

export async function completeGame(result: {
  gameType: string;
  gameId?: string;
  durationMs?: number;
  mode?: string;
  players: Array<{ userId: string; username?: string; placement: number; score?: number; isBot?: boolean }>;
}): Promise<{ updated: Array<{ userId: string; eloDelta: number; won: boolean }> }> {
  return fetchWithToken('/games/complete', {
    method: 'POST',
    body: JSON.stringify(result),
  });
}

// ──────────────────────────────────────────────
// Hkim (trajectoires) — 10 par user, écran Carte
// ──────────────────────────────────────────────

export interface HkimGeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface Hkim {
  _id: string;
  userId: string;
  name: string;
  order: number;
  start: HkimGeoPoint;
  end: HkimGeoPoint;
  distanceMeters: number;
  /** Polyline encodée (Google) de l'itinéraire routier réel. */
  routePolyline?: string;
  maxDate: string;
  status: 'pending' | 'done';
  completedAt?: string;
}

/** Jeu courant → collection Mongo dédiée hkim_<jeu> côté backend. */
export const HKIM_GAME = 'kdoub';

/** Liste les hkim du user (auto-seed 10 côté backend si vide + coords fournies). */
export async function getHkims(lat?: number, lng?: number): Promise<Hkim[]> {
  const q =
    lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
  const data = await fetchWithToken(`/hkim/${HKIM_GAME}${q}`, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

/** Régénère 10 hkim autour de (lat,lng). */
export async function regenerateHkims(lat: number, lng: number): Promise<Hkim[]> {
  const data = await fetchWithToken(`/hkim/${HKIM_GAME}/generate`, {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
  return Array.isArray(data) ? data : [];
}

/** Marque un hkim comme effectué. */
export async function completeHkim(id: string): Promise<Hkim> {
  return fetchWithToken(`/hkim/${HKIM_GAME}/${id}/complete`, { method: 'POST' });
}

export async function getHkimSummary(): Promise<{
  total: number;
  done: number;
  pending: number;
  items: Hkim[];
}> {
  return fetchWithToken(`/hkim/${HKIM_GAME}/summary`, { method: 'GET' });
}

export interface HkimComment {
  username: string;
  text: string;
  createdAt: string;
}

export interface HkimFeedItem {
  hkimId: string;
  userId: string;
  username: string;
  name: string;
  from: string;
  to: string;
  start?: HkimGeoPoint;
  end?: HkimGeoPoint;
  distanceMeters: number;
  completedAt: string;
  comments: HkimComment[];
}

/** Seed 10 hkim "historique" pour le user + autres users (fil). */
export async function seedHkimHistory(
  lat: number,
  lng: number,
): Promise<{ mine: number; others: number }> {
  return fetchWithToken(`/hkim/${HKIM_GAME}/seed-history`, {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  });
}

/** Fil d'actualité : hkim effectués par tous les users. */
export async function getHkimFeed(limit = 30): Promise<HkimFeedItem[]> {
  const data = await fetchWithToken(`/hkim/${HKIM_GAME}/feed?limit=${limit}`, {
    method: 'GET',
  });
  return Array.isArray(data) ? data : [];
}

export async function getHkimComments(id: string): Promise<HkimComment[]> {
  const data = await fetchWithToken(`/hkim/${HKIM_GAME}/${id}/comments`, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

export async function addHkimComment(
  id: string,
  text: string,
): Promise<HkimComment[]> {
  const data = await fetchWithToken(`/hkim/${HKIM_GAME}/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return Array.isArray(data) ? data : [];
}
