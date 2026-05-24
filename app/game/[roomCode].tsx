/**
 * @file game/[roomCode].tsx
 * @description Table Kdoub multijoueur TEMPS RÉEL — client MINCE du gateway
 *   /game AUTORITATIF (le serveur fait foi). On se connecte au namespace /game,
 *   on émet `game:join {roomCode, gameType:'kdoub'}`, on rend la vue
 *   personnalisée reçue via `game:state` (ma main visible, valeur déclarée,
 *   tas face caché, « Kdoub ! »), et on émet `game:action {roomCode, action}`.
 *
 *   ⇒ INTEROP WEB ↔ MOBILE : un joueur connecté sur le web et un joueur sur
 *   mobile partagent EXACTEMENT la même room (`kdoub:CODE`) sur l'unique
 *   instance socket-server. Mêmes events, même forme d'état, mêmes cartes
 *   espagnoles. Ce fichier est l'exact pendant RN de
 *   apps/web/app/kdoub/room/[code]/page.tsx.
 *
 *   Les bots qui complètent les sièges vides + toutes les transitions
 *   (séquences, contestations, manches) sont gérés CÔTÉ SERVEUR.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppHeader from '../../src/components/AppHeader';
import AnimatedCard from '../../src/components/AnimatedCard';
import P2PCall from '../../src/components/P2PCall';
import Chat from '../../src/components/Chat';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import { APP_CONFIG } from '../../src/config/app.config';
import { getSocketUrl } from '../../shared/api';
import * as api from '../../shared/api';
import { io, Socket } from 'socket.io-client';
import type { Card as MobileCard, CardValue as MobileCardValue } from '../../src/game/kdoubEngine';

const log = logger.scoped('KdoubRoom');

const GOLD = '#FCD34D';
const PURPLE = '#8B5CF6';

// ── Forme d'état reçue du serveur (kdoubView) — identique au client web ──────
type ServerSuit = 'B' | 'C' | 'E' | 'O';
type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
interface ServerCard { id: string; suit: ServerSuit; value: CardValue }
interface SeatPlayer { id: string; name: string; isBot: boolean; count: number; score: number; hand?: ServerCard[] }
interface Snapshot {
  game: 'kdoub';
  youId: string;
  phase: 'playing' | 'challenge' | 'reveal' | 'round_end' | 'over';
  currentId: string | null;
  deciderId: string | null;
  declaredValue: CardValue | null;
  valueNames: Record<number, string>;
  values: CardValue[];
  pileCount: number;
  deckCount: number;
  winner: number | null;
  roundNumber: number;
  lastEvent: string;
  log: string[];
  lastChallenge: any;
  players: SeatPlayer[];
}

// ── Mappe une carte SERVEUR (id "7E", suit B|C|E|O) vers l'asset mobile ──────
// (les images mobiles sont indexées "07-espadas", "12-oros", etc.)
const SUIT_LONG: Record<ServerSuit, MobileCard['suit']> = { B: 'bastos', C: 'copas', E: 'espadas', O: 'oros' };
function toMobileCard(c: ServerCard): MobileCard {
  const suit = SUIT_LONG[c.suit];
  const padded = String(c.value).padStart(2, '0');
  return { id: `${padded}-${suit}`, suit, value: c.value as MobileCardValue };
}

/**
 * Résout un token valide pour le handshake socket : token courant, sinon
 * session invité (le web fait pareil via socketAuth). Garantit que le
 * middleware d'auth WS (sub + username requis) ne rejette pas la connexion.
 */
async function ensureToken(): Promise<string | null> {
  if (api.getAuthToken()) return api.getAuthToken();
  try { await api.createGuestSession(); } catch (e) { log.warn('guest session failed', (e as any)?.message); }
  return api.getAuthToken();
}

/** Sur erreur de token : refresh → invité (repli), comme forceRefreshGameToken web. */
async function refreshAuth(): Promise<string | null> {
  try { await api.refreshTokenAsync(); }
  catch { try { await api.createGuestSession(); } catch {} }
  return api.getAuthToken();
}

export default function KdoubRoomScreen() {
  const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const code = (roomCode || '').toString().toUpperCase();
  const router = useRouter();
  const { palette } = useTheme();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const tokenRef = useRef<string | null>(api.getAuthToken());

  // ── Connexion au gateway /game autoritatif ────────────────────────────────
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      await ensureToken();
      if (cancelled) return;
      tokenRef.current = api.getAuthToken();
      // auth en FONCTION : à chaque (re)connexion socket.io relit tokenRef →
      // un token rafraîchi est pris en compte sans recréer le socket.
      const s = io(`${getSocketUrl()}/game`, {
        transports: ['websocket'],
        timeout: 8000,
        auth: (cb: (d: any) => void) => cb({ token: tokenRef.current }),
      });
      socketRef.current = s;

      s.on('connect', () => {
        setConnected(true);
        log.explain(`socket /game connecté → game:join kdoub:${code}`);
        s.emit('game:join', { roomCode: code, gameType: 'kdoub' });
      });
      s.on('disconnect', () => setConnected(false));
      s.on('game:state', (snapshot: Snapshot) => setSnap(snapshot));
      s.on('game:error', (e: any) => log.warn('game:error', e?.message));
      s.on('connect_error', async (e: any) => {
        log.warn('connect_error', e?.message);
        if (/token|auth|jwt|unauthor/i.test(e?.message || '')) {
          await refreshAuth();
          tokenRef.current = api.getAuthToken();
          // socket.io retentera tout seul (function-auth relira le token).
        }
      });
    })();
    return () => { cancelled = true; socketRef.current?.disconnect(); socketRef.current = null; };
  }, [code]);

  // ── Dérivés ────────────────────────────────────────────────────────────────
  const me = snap?.players.find((p) => p.id === snap.youId) || null;
  const myIdx = snap && me ? snap.players.indexOf(me) : -1;
  const opponents = snap ? snap.players.filter((p) => p.id !== snap.youId) : [];
  const myHand = me?.hand || [];
  const locked: CardValue | null = snap?.declaredValue ?? null;
  const myTurn = !!(snap && me && snap.phase === 'playing' && snap.currentId === me.id);
  const iAmDecider = !!(snap && me && snap.phase === 'challenge' && snap.deciderId === me.id);
  const valueName = useCallback((v: CardValue) => snap?.valueNames?.[v] ?? String(v), [snap?.valueNames]);

  // ── Émetteurs d'actions (le serveur injecte le playerId depuis l'auth) ──────
  const emit = useCallback((action: any) => {
    socketRef.current?.emit('game:action', { roomCode: code, action });
  }, [code]);

  const playCard = useCallback((cardId: string, declared: CardValue) => {
    setSel(null);
    emit({ type: 'PLAY', cardId, declaredValue: declared });
  }, [emit]);

  const onCardPress = useCallback((c: ServerCard) => {
    if (iAmDecider) { playCard(c.id, locked!); return; }
    if (!myTurn) return;
    if (locked !== null) playCard(c.id, locked);
    else setSel((cur) => (cur === c.id ? null : c.id));
  }, [iAmDecider, myTurn, locked, playCard]);

  const cryKdoub = useCallback(() => { setSel(null); emit({ type: 'CHALLENGE' }); }, [emit]);
  const rematch = useCallback(() => { setSel(null); socketRef.current?.emit('game:start', { roomCode: code }); }, [code]);

  const styles = useMemo(() => createStyles(palette), [palette]);
  const isOver = snap?.phase === 'over';
  const iWin = isOver && snap?.winner === myIdx;

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title={APP_CONFIG.name}
        subtitle={`Salon ${code || '—'} ${connected ? '· 🟢' : '· 🔌'}`}
        showBack
        onBack={() => setShowQuit(true)}
      />

      <ScrollView contentContainerStyle={styles.body}>
        {/* Comms : appel audio/vidéo + chat INDÉPENDANTS (les deux en même temps
            possible) — parité avec le plateau web. */}
        <View style={styles.commsRow}>
          <TouchableOpacity onPress={() => setVoiceOpen((v) => !v)} style={[styles.commsBtn, voiceOpen && styles.commsBtnActive]}>
            <Ionicons name="videocam" size={16} color="#fff" />
            <Text style={styles.commsBtnText}>📹 Appel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setChatOpen((v) => !v)} style={[styles.commsBtn, chatOpen && styles.commsBtnActive]}>
            <Ionicons name="chatbubbles" size={16} color="#fff" />
            <Text style={styles.commsBtnText}>💬 Chat</Text>
          </TouchableOpacity>
        </View>
        {voiceOpen && (
          <View style={{ marginBottom: 12 }}>
            {/* compact = MA vignette + celles des AUTRES participants, sur une
                rangée — n'écrase pas la table. */}
            <P2PCall compact roomCode={code} displayName={me?.name ?? 'Joueur'} authToken={api.getAuthToken() ?? ''} onClose={() => setVoiceOpen(false)} />
          </View>
        )}
        {chatOpen && (
          <View style={{ marginBottom: 12 }}>
            <Chat roomId={`kdoub-${code}`} token={api.getAuthToken()} onClose={() => setChatOpen(false)} />
          </View>
        )}

        {!snap && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{connected ? 'Distribution…' : 'Connexion à la room…'}</Text>
          </View>
        )}

        {snap && (
          <>
            {/* Adversaires */}
            <View style={styles.oppRow}>
              {opponents.map((p) => {
                const active = snap.currentId === p.id && snap.phase !== 'over';
                return (
                  <View key={p.id} style={[styles.oppPill, active && styles.oppPillActive]}>
                    <Text style={styles.oppName}>{p.isBot ? '🤖' : '🧑'} {p.name}</Text>
                    <Text style={[styles.oppMeta, { color: palette.textSecondary }]}>· {p.count}🂠 · {p.score}pts</Text>
                  </View>
                );
              })}
            </View>

            {/* Centre : tas face caché + valeur déclarée */}
            <View style={styles.center}>
              <View style={styles.pileBox}>
                <View style={styles.pileStack}>
                  {snap.pileCount === 0 ? (
                    <View style={styles.pileEmpty} />
                  ) : (
                    Array.from({ length: Math.min(snap.pileCount, 4) }).map((_, k) => (
                      <View key={k} style={{ position: 'absolute', left: k * 3, top: k * 2 }}>
                        <AnimatedCard faceDown size="small" />
                      </View>
                    ))
                  )}
                </View>
                <Text style={[styles.pileLabel, { color: palette.textSecondary }]}>Tas ({snap.pileCount})</Text>
              </View>
              <View style={[styles.declaredBox, locked !== null && styles.declaredBoxActive]}>
                <Text style={[styles.declaredLabel, { color: locked !== null ? '#0A1535' : palette.textSecondary }]}>Valeur déclarée</Text>
                <Text style={[styles.declaredValue, { color: locked !== null ? '#0A1535' : '#fff' }]}>{locked !== null ? valueName(locked) : '—'}</Text>
              </View>
            </View>

            {/* Bandeau d'état */}
            <Text style={[styles.statusLine, { color: snap.phase === 'reveal' ? GOLD : palette.textSecondary }]}>
              {snap.phase === 'over' ? snap.lastEvent
                : iAmDecider ? '🔔 À toi : crie « Kdoub ! » pour contester, ou pose une carte pour enchaîner.'
                : myTurn ? (locked !== null ? `Pose une carte en déclarant « ${valueName(locked)} ».` : 'Choisis une carte puis la valeur à déclarer.')
                : snap.lastEvent}
            </Text>

            {/* Bouton KDOUB ! */}
            {iAmDecider && (
              <TouchableOpacity onPress={cryKdoub} style={styles.kdoubBtn} activeOpacity={0.85}>
                <Ionicons name="megaphone" size={18} color="#fff" />
                <Text style={styles.kdoubBtnText}>KDOUB !</Text>
              </TouchableOpacity>
            )}

            {/* Sélecteur de valeur (déclaration, bluff possible) */}
            {myTurn && locked === null && sel && (
              <View style={styles.valuePicker}>
                <Text style={styles.valuePickerTitle}>Déclare une valeur (mens si tu veux) :</Text>
                <View style={styles.valueRow}>
                  {(snap.values || []).map((v) => (
                    <TouchableOpacity key={v} onPress={() => playCard(sel, v)} style={styles.valueBtn}>
                      <Text style={styles.valueBtnText}>{valueName(v)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Ma main */}
            <Text style={[styles.handTitle, { color: palette.text }]}>
              Votre main ({myHand.length}){me ? ` · ${me.score} pts` : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handScroll}>
              {myHand.map((c) => {
                const playable = myTurn || iAmDecider;
                const chosen = sel === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onCardPress(c)}
                    disabled={!playable}
                    style={({ pressed }) => [
                      styles.handSlot,
                      { transform: [{ translateY: chosen ? -10 : playable && pressed ? -2 : 0 }] },
                    ]}
                  >
                    <AnimatedCard card={toMobileCard(c)} size="medium" selected={chosen} disabled={!playable} />
                  </Pressable>
                );
              })}
              {myHand.length === 0 && <Text style={{ color: palette.textSecondary, padding: 12 }}>—</Text>}
            </ScrollView>

            {/* Journal */}
            <View style={styles.logBox}>
              {(snap.log || []).map((l, i) => (
                <Text key={i} style={[styles.logLine, { color: i === 0 ? '#fff' : palette.textSecondary }]}>{l}</Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Fin de partie */}
      <Modal visible={isOver} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <LinearGradient colors={['#0A0A1A', palette.card]} style={[styles.modalCard, { borderColor: GOLD }]}>
            <Text style={styles.modalEmoji}>{iWin ? '🏆' : '🙃'}</Text>
            <Text style={styles.modalTitle}>{iWin ? 'Vous gagnez la partie !' : `${snap?.players[snap.winner ?? 0]?.name ?? '—'} gagne`}</Text>
            <Text style={[styles.modalSub, { color: palette.textSecondary }]}>
              {(snap?.players || []).map((p) => `${p.name}: ${p.score}`).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity onPress={rematch} style={[styles.modalBtn, { backgroundColor: APP_CONFIG.primary }]}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.modalBtnText}>Revanche</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.modalBtnText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* Quitter */}
      <Modal visible={showQuit} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={styles.modalTitle}>Quitter la partie ?</Text>
            <Text style={[styles.modalSub, { color: palette.textSecondary }]}>Vous pourrez la rejoindre avec le même code.</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
              <TouchableOpacity onPress={() => setShowQuit(false)} style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.modalBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowQuit(false); router.back(); }} style={[styles.modalBtn, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.modalBtnText}>Quitter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    body: { padding: 14, paddingBottom: 40 },
    commsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    commsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: APP_CONFIG.primary },
    commsBtnActive: { backgroundColor: '#7C3AED' },
    commsBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 14 },
    empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
    emptyText: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter-Bold' },
    oppRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    oppPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
    oppPillActive: { backgroundColor: 'rgba(252,211,77,0.2)', borderColor: GOLD },
    oppName: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 12 },
    oppMeta: { fontSize: 10 },
    center: {
      flexDirection: 'row', gap: 24, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
      minHeight: 120, borderRadius: 24, borderWidth: 5, borderColor: '#3b1d5e',
      backgroundColor: '#2a1145', padding: 18, marginBottom: 12, overflow: 'hidden',
    },
    pileBox: { alignItems: 'center' },
    pileStack: { width: 60, height: 84 },
    pileEmpty: { width: 56, height: 80, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed' },
    pileLabel: { fontSize: 11, marginTop: 6 },
    declaredBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, minWidth: 100, alignItems: 'center' },
    declaredBoxActive: { backgroundColor: GOLD },
    declaredLabel: { fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1, textTransform: 'uppercase' },
    declaredValue: { fontFamily: 'Inter-Black', fontSize: 22 },
    statusLine: { fontSize: 13, fontFamily: 'Inter-SemiBold', marginBottom: 10, minHeight: 20 },
    kdoubBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10, marginBottom: 12 },
    kdoubBtnText: { color: '#fff', fontFamily: 'Inter-Black', fontSize: 14, letterSpacing: 1 },
    valuePicker: { backgroundColor: 'rgba(139,92,246,0.12)', borderWidth: 1, borderColor: PURPLE, borderRadius: 12, padding: 12, marginBottom: 12 },
    valuePickerTitle: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 13, marginBottom: 8 },
    valueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    valueBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    valueBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 13 },
    handTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginBottom: 8 },
    handScroll: { paddingVertical: 12, paddingHorizontal: 4, gap: 8, minHeight: 120 },
    handSlot: { marginHorizontal: 4 },
    logBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginTop: 14, maxHeight: 140 },
    logLine: { fontSize: 12, paddingVertical: 2 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
    modalCard: { padding: 26, borderRadius: 20, alignItems: 'center', borderWidth: 2, minWidth: 290, maxWidth: '85%' },
    modalEmoji: { fontSize: 52, marginBottom: 6 },
    modalTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Black', letterSpacing: 0.3, textAlign: 'center' },
    modalSub: { fontSize: 13, fontFamily: 'Inter-SemiBold', marginTop: 6, textAlign: 'center' },
    modalBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
    modalBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  });
}
