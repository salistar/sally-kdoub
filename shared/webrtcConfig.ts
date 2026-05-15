/**
 * @file shared/webrtcConfig.ts
 * @description Configuration ICE (STUN + TURN) pour les appels vidéo P2P.
 *
 * Pourquoi ce fichier
 * -------------------
 * P2PCall utilise notre socket-server pour le signaling. Quand on construit
 * un vrai RTCPeerConnection (dev build EAS avec react-native-webrtc), il
 * faut lui passer la config `iceServers` pour que les pairs trouvent un
 * chemin réseau (NAT traversal).
 *
 * Stack locale
 * ------------
 * - coturn tourne dans Docker (`sallycards-turn`, port 3478 UDP/TCP)
 * - turnserver.conf utilise `lt-cred-mech` avec user statique :
 *     user=sallycards:sallycards_dev_turn_2026
 * - Le host est le même que celui de Metro (auto-détecté via Constants).
 *
 * Pour la prod : remplacer par /api/turn-creds (HMAC-SHA1 tournant 24h).
 */

import Constants from 'expo-constants';

/** Type minimal RTCIceServer (évite d'importer react-native-webrtc ici). */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Détection du host TURN/STUN (même IP que l'API/Socket par défaut). */
function resolveTurnHost(): string {
  if (process.env.EXPO_PUBLIC_TURN_HOST) {
    return process.env.EXPO_PUBLIC_TURN_HOST;
  }
  const hostUri =
    (Constants as any).expoConfig?.hostUri ||
    (Constants as any).manifest?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(':')[0];
    if (host) return host;
  }
  return 'localhost';
}

const TURN_HOST = resolveTurnHost();
const TURN_PORT = process.env.EXPO_PUBLIC_TURN_PORT || '3478';
const TURN_USER = process.env.EXPO_PUBLIC_TURN_USER || 'sallycards';
const TURN_PASS = process.env.EXPO_PUBLIC_TURN_PASS || 'sallycards_dev_turn_2026';

/**
 * Liste d'iceServers prête à être passée à `new RTCPeerConnection({ iceServers })`.
 *
 * 100% LOCAL — aucun STUN/TURN externe (pas de Google, pas de Twilio).
 * Ordre :
 *   1. Notre STUN local (rapide, LAN)
 *   2. Notre TURN local UDP (relay si NAT symétrique)
 *   3. Notre TURN local TCP (fallback si UDP bloqué)
 */
export const LOCAL_ICE_SERVERS: IceServer[] = [
  { urls: `stun:${TURN_HOST}:${TURN_PORT}` },
  {
    urls: [
      `turn:${TURN_HOST}:${TURN_PORT}?transport=udp`,
      `turn:${TURN_HOST}:${TURN_PORT}?transport=tcp`,
    ],
    username: TURN_USER,
    credential: TURN_PASS,
  },
];

if (__DEV__) {
  console.log('[webrtc] TURN/STUN host →', `${TURN_HOST}:${TURN_PORT}`);
  console.log('[webrtc] iceServers →', LOCAL_ICE_SERVERS.length, 'entries');
}

/**
 * Helper pour construire la config RTCPeerConnection complète.
 * Utilisable directement : `new RTCPeerConnection(buildPeerConfig())`.
 */
export function buildPeerConfig(): { iceServers: IceServer[]; iceTransportPolicy?: 'all' | 'relay' } {
  return {
    iceServers: LOCAL_ICE_SERVERS,
    // 'all' : essaie d'abord direct (host candidates), puis STUN, puis TURN.
    // Passer à 'relay' force le passage par TURN (utile pour debug).
    iceTransportPolicy: 'all',
  };
}
