/**
 * @file game/[roomCode].tsx
 * @description Vraie scène de jeu Kdoub utilisant le moteur complet
 * (kdoubEngine.ts) + composants réels (CardComponent, HandComponent,
 * GameTableComponent, ValueSelector).
 *
 * Layout plein écran :
 *   - Video strip transparent en haut (caméra + avatars joueurs)
 *   - Plateau de jeu sur la quasi-totalité de l'écran :
 *       · adversaires en haut (avatars + nb cartes)
 *       · table centrale (pile + dernière déclaration + Kdoub!)
 *       · main du joueur en bas
 *   - En mode simulation, les bots jouent auto OU l'host passe le device
 *
 * Règle Kdoub respectée : valeur déclarée verrouillée tant que pas de Kdoub.
 */

import React, { useReducer, useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StatusBar as RNStatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';
import {
  gameReducer,
  createInitialState,
  getCurrentPlayer,
  getNextPlayerIndex,
  isPlayerTurn,
  botPlayCard,
  botShouldChallenge,
  formatDeclaredValue,
  CardValue,
  Player as EnginePlayer,
  GameState,
  CHALLENGE_TIMEOUT_MS,
  MAX_PLAYERS,
} from '../../src/game/kdoubEngine';
import HandComponent from '../../src/components/HandComponent';
import GameTableComponent from '../../src/components/GameTableComponent';
import ValueSelector from '../../src/components/ValueSelector';
import CardComponent from '../../src/components/CardComponent';

// expo-camera pour le mini panneau vidéo
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const c = require('expo-camera');
  CameraView = c.CameraView;
  useCameraPermissions = c.useCameraPermissions;
} catch {}

// expo-speech : voix synthétique "KDOUB!" — bundled dans Expo Go
let Speech: any = null;
try { Speech = require('expo-speech'); } catch {}

// expo-haptics : vibration tactile (déjà dans package.json)
let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}

/** Joue le cri "KDOUB!" (TTS + vibration) quand un joueur conteste */
function playKdoubSound() {
  if (Speech) {
    try {
      Speech.stop();
      Speech.speak('Kdoub!', {
        language: 'fr-FR',
        rate: 1.3,
        pitch: 1.4,
        volume: 1.0,
        onError: (e: any) => log.error('Speech.speak onError', e?.message || e),
      });
      log.explain('🔊 Speech.speak("Kdoub!") déclenché');
    } catch (e: any) {
      log.error('Speech.speak threw', e?.message);
    }
  } else {
    log.warn('expo-speech non chargé — pas de son TTS');
  }
  if (Haptics) {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e: any) {
      log.error('Haptics threw', e?.message);
    }
  }
}

const log = logger.scoped('GameScreen');

export default function GameScreen() {
  
  const { t } = useTranslation();
const { roomCode } = useLocalSearchParams<{ roomCode: string }>();
  const router = useRouter();
  const [state, dispatch] = useReducer(gameReducer, createInitialState(100, 10));
  const [me, setMe] = useState<api.User | null>(null);
  const [room, setRoom] = useState<api.RoomFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const challengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init : charge me + room, puis JOIN tous les joueurs + START_GAME
  useEffect(() => {
    log.screen('mounted', 'roomCode=' + roomCode);
    (async () => {
      try {
        const [u, r] = await Promise.all([
          api.getMe(),
          api.findRoomByCode(String(roomCode)),
        ]);
        setMe(u);
        setRoom(r);
        log.explain(`partie ${r.code} · ${r.players.length} joueurs`);

        // Dispatch JOIN pour chaque joueur (moi + bots simulés)
        // Fallback : si la room est en mode simulation, tout joueur ≠ host est bot
        // (utile si le schéma DB n'a pas encore le flag isSimulated persisté).
        const myUid = String(u.id || (u as any)._id || '');
        const isSimRoom = !!(r as any).config?.isSimulated;
        r.players.forEach((p: any) => {
          const pid = String(p.userId);
          const isBot = !!p.isSimulated || (isSimRoom && pid !== myUid);
          dispatch({
            type: 'JOIN',
            playerId: pid,
            playerName: p.username,
            isBot,
          });
        });
        log.explain(`joueurs JOIN : ${r.players.map((p:any)=> `${p.username}${(!!p.isSimulated || (isSimRoom && String(p.userId)!==myUid)) ? '🤖' : '👤'}`).join(', ')}`);

        // Démarre la partie
        setTimeout(() => {
          dispatch({ type: 'START_GAME' });
          setGameStarted(true);
          log.explain('START_GAME → cartes distribuées');
        }, 300);
      } catch (e: any) {
        log.error('init game failed', e?.message);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current);
    };
  }, [roomCode]);

  // ── Auto-pilote unique : gère playing + challenging ──
  // Une seule useEffect qui réagit à TOUT changement d'état pertinent.
  // Évite les races entre 2 useEffect qui peuvent se court-circuiter.
  useEffect(() => {
    if (!gameStarted) return;

    // Cleanup à chaque re-run
    if (botTimerRef.current) clearTimeout(botTimerRef.current);
    if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current);

    // ── PHASE 1 : un bot doit jouer ──
    if (state.phase === 'playing') {
      const cur = getCurrentPlayer(state);
      if (!cur) { log.warn('autopilot: pas de joueur courant'); return; }
      if (!cur.isBot) { log.screen('autopilot', `tour humain (${cur.name}) — attente`); return; }
      if (cur.hand.length === 0) { log.warn(`autopilot: ${cur.name} sans cartes`); return; }

      log.explain(`tour de ${cur.name} (bot) — joue dans 1.2s`);
      botTimerRef.current = setTimeout(() => {
        try {
          const { cardIndex, declaredValue } = botPlayCard(
            cur,
            state.currentDeclaredValue,
          );
          log.explain(`${cur.name} pose une carte, déclare ${formatDeclaredValue(declaredValue)}`);
          dispatch({
            type: 'PLAY_CARD',
            playerId: cur.id,
            cardIndex,
            declaredValue,
          });
        } catch (e: any) {
          log.error(`${cur.name} bot play failed`, e?.message);
        }
      }, 1200);
      return;
    }

    // ── PHASE 2 : challenge — SEUL le joueur suivant décide ──
    // Règle : quand son tour arrive, soit Kdoub! (bouton rouge), soit il pose une carte.
    if (state.phase === 'challenging' && state.lastPlay) {
      const nextIdx = getNextPlayerIndex(state.currentPlayerIndex, state.players);
      const nextPlayer = state.players[nextIdx];
      if (!nextPlayer) return;
      // Si c'est mon tour, on attend ma décision (bouton Kdoub OU clic carte)
      if (!nextPlayer.isBot) {
        log.screen('autopilot', `attente décision humain (${nextPlayer.name})`);
        return;
      }
      if (nextPlayer.hand.length === 0) {
        // Bot sans cartes → pass auto
        challengeTimerRef.current = setTimeout(() => {
          dispatch({ type: 'PASS_CHALLENGE', playerId: nextPlayer.id });
        }, 800);
        return;
      }

      // Bot suivant décide : 30% Kdoub! · 70% poser une carte
      const willChallenge = Math.random() < 0.3;
      log.explain(
        willChallenge
          ? `${nextPlayer.name} (bot) va crier KDOUB! dans 1.2s`
          : `${nextPlayer.name} (bot) va poser une carte dans 1.2s`,
      );

      challengeTimerRef.current = setTimeout(() => {
        try {
          if (willChallenge) {
            log.explain(`💥 ${nextPlayer.name} : KDOUB!`);
            playKdoubSound();
            dispatch({ type: 'CHALLENGE', challengerId: nextPlayer.id });
            setShowReveal(true);
            setTimeout(() => {
              setShowReveal(false);
              dispatch({ type: 'NEXT_TURN' });
            }, 2200);
          } else {
            // Le bot pose une carte → engine auto-pass + play en une action
            const { cardIndex, declaredValue } = botPlayCard(
              nextPlayer,
              state.currentDeclaredValue,
            );
            log.explain(`${nextPlayer.name} pose, déclare ${formatDeclaredValue(declaredValue)}`);
            dispatch({
              type: 'PLAY_CARD',
              playerId: nextPlayer.id,
              cardIndex,
              declaredValue,
            });
          }
        } catch (e: any) {
          log.error(`${nextPlayer.name} bot decision failed`, e?.message);
        }
      }, 1200);
      return;
    }

    // PHASE round_end → auto NEW_ROUND après 2s pour relancer
    if (state.phase === 'round_end') {
      challengeTimerRef.current = setTimeout(() => {
        log.explain('manche terminée → nouvelle manche');
        dispatch({ type: 'NEW_ROUND' });
      }, 2000);
    }
  }, [state.phase, state.currentPlayerIndex, state.lastPlay?.playerId, gameStarted]);

  // ── Handlers joueur humain ─────────────────────────────
  const currentPlayer = getCurrentPlayer(state);
  // L'API renvoie _id (Mongo), le TypeScript dit id — on essaie les deux.
  const myId = String(me?.id || (me as any)?._id || '');
  if (__DEV__ && me && state.players.length > 0) {
    log.screen('turn check', `myId=${myId} current=${currentPlayer?.id}/${currentPlayer?.name} phase=${state.phase}`);
  }
  const myPlayer = state.players.find((p) => p.id === myId);
  // Pendant 'challenging', le joueur "actif" pour décider est le SUIVANT
  // (le currentPlayerIndex pointe encore sur celui qui vient de poser).
  const decisionPlayerIndex =
    state.phase === 'challenging'
      ? getNextPlayerIndex(state.currentPlayerIndex, state.players)
      : state.currentPlayerIndex;
  const decisionPlayer = state.players[decisionPlayerIndex] || null;
  const isMyTurn = state.phase === 'playing' && currentPlayer?.id === myId;
  // Kdoub! n'est dispo QUE quand mon tour arrive (= je suis le joueur suivant)
  const canChallenge =
    state.phase === 'challenging' &&
    !!state.lastPlay &&
    decisionPlayer?.id === myId &&
    !!myPlayer && myPlayer.hand.length > 0;
  // Je peux aussi poser une carte directement durant 'challenging' = renoncer
  const canPlayDuringChallenge =
    state.phase === 'challenging' && decisionPlayer?.id === myId;

  const handleSelectCard = useCallback(
    (index: number) => {
      const allowed = isMyTurn || canPlayDuringChallenge;
      if (!allowed) {
        const blocking = decisionPlayer?.name || currentPlayer?.name || '?';
        Alert.alert(t('notYourTurn'), t('waitingFor', { name: blocking }));
        return;
      }
      // Règle Kdoub : si valeur verrouillée, on joue direct sans picker
      if (state.currentDeclaredValue !== null) {
        log.explain(`valeur verrouillée (${formatDeclaredValue(state.currentDeclaredValue)}) → tu joues direct`);
        dispatch({
          type: 'PLAY_CARD',
          playerId: myId,
          cardIndex: index,
          declaredValue: state.currentDeclaredValue,
        });
        return;
      }
      setSelectedCardIndex(index);
      setShowValueSelector(true);
    },
    [isMyTurn, canPlayDuringChallenge, myId, state.currentDeclaredValue, currentPlayer, decisionPlayer],
  );

  const handleDeclareValue = useCallback(
    (value: CardValue) => {
      if (selectedCardIndex === null) return;
      setShowValueSelector(false);
      log.explain(`déclares ${formatDeclaredValue(value)} (bluff possible)`);
      dispatch({
        type: 'PLAY_CARD',
        playerId: myId,
        cardIndex: selectedCardIndex,
        declaredValue: value,
      });
      setSelectedCardIndex(null);
    },
    [selectedCardIndex, myId],
  );

  const handleKdoub = useCallback(() => {
    if (!canChallenge) return;
    playKdoubSound();
    log.screen('Kdoub!', { target: state.lastPlay?.playerId });
    dispatch({ type: 'CHALLENGE', challengerId: myId });
    setShowReveal(true);
    setTimeout(() => {
      setShowReveal(false);
      dispatch({ type: 'NEXT_TURN' });
    }, 2500);
  }, [canChallenge, myId, state.lastPlay]);

  const handlePassChallenge = useCallback(() => {
    if (state.phase !== 'challenging') return;
    dispatch({ type: 'PASS_CHALLENGE', playerId: myId });
  }, [state.phase, myId]);

  const handleQuit = () => {
    Alert.alert(t('quitGame'), t('quitGameDesc'), [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui', onPress: () => router.replace('/(tabs)') },
    ]);
  };

  // Mini video camera
  const [camPerm, requestCam] = (useCameraPermissions as any)?.() ?? [null, () => {}];
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  useEffect(() => {
    if (CameraView && camPerm && !camPerm.granted) requestCam();
  }, [camPerm]);

  if (loading || !state || !me) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color="#C084FC" />
        <Text style={styles.loadingText}>Chargement de la partie…</Text>
      </View>
    );
  }

  const opponents = state.players.filter((p) => p.id !== myId);
  const isLockedValue = state.currentDeclaredValue !== null;

  // Layout adaptatif : taille des tuiles selon nombre d'adversaires
  const oppCount = opponents.length;
  const oppTileSize = oppCount <= 3 ? 78 : oppCount <= 5 ? 68 : oppCount <= 7 ? 60 : 54;
  const oppAvatarSize = oppCount <= 3 ? 40 : oppCount <= 5 ? 34 : 28;
  const myTileWidth = oppCount <= 3 ? 110 : 90;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#064E3B', '#0A0A1A', '#064E3B']} style={StyleSheet.absoluteFill} />
      <RNStatusBar barStyle="light-content" backgroundColor="#064E3B" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ─── BANDEAU VIDEO + AVATARS JOUEURS ─── */}
        <View style={styles.topStrip}>
          {/* Ma caméra */}
          <View style={[styles.myTile, { width: myTileWidth }]}>
            {CameraView && camPerm?.granted && camOn ? (
              <CameraView style={{ flex: 1 }} facing="front" mute={!micOn} />
            ) : (
              <LinearGradient colors={['#7C3AED', '#C026D3']} style={styles.myCamOff}>
                <Ionicons name="person" size={22} color="#fff" />
              </LinearGradient>
            )}
            <View style={styles.myLabel}>
              <Text style={styles.myLabelText}>Moi</Text>
            </View>
            <View style={styles.tileBtns}>
              <TouchableOpacity onPress={() => setMicOn(v => !v)} style={[styles.tileBtn, !micOn && styles.tileBtnOff]}>
                <Ionicons name={micOn ? 'mic' : 'mic-off'} size={9} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCamOn(v => !v)} style={[styles.tileBtn, !camOn && styles.tileBtnOff]}>
                <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={9} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Adversaires : flex pour ≤6 (sans scroll), scroll horizontal sinon */}
          {oppCount <= 6 ? (
            <View style={[styles.oppFlex]}>
              {opponents.map((p) => {
                const active = currentPlayer?.id === p.id;
                const justPlayed = state.lastPlay?.playerId === p.id;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.oppTile,
                      { width: oppTileSize, height: oppTileSize + 12 },
                      active && styles.oppTileActive,
                    ]}
                  >
                    <LinearGradient
                      colors={
                        active
                          ? ['#F59E0B', '#FBBF24']
                          : p.isBot
                          ? ['#EC4899', '#8B5CF6']
                          : ['#7C3AED', '#A855F7']
                      }
                      style={[styles.oppAvatar, { width: oppAvatarSize, height: oppAvatarSize, borderRadius: oppAvatarSize / 2 }]}
                    >
                      <Ionicons name={p.isBot ? 'hardware-chip' : 'person'} size={oppAvatarSize * 0.55} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.oppName} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.oppMeta}>
                      <Ionicons name="albums" size={8} color="#fff" />
                      <Text style={styles.oppMetaText}>{p.hand.length}</Text>
                    </View>
                    {active && (
                      <View style={styles.turnBadge}>
                        <Text style={styles.turnBadgeText}>♦</Text>
                      </View>
                    )}
                    {justPlayed && state.phase === 'challenging' && (
                      <View style={styles.playedBadge}>
                        <Text style={styles.playedBadgeText}>
                          {formatDeclaredValue(state.lastPlay!.declaredValue)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.oppRow} style={{ flex: 1 }}>
              {opponents.map((p) => {
                const active = currentPlayer?.id === p.id;
                const justPlayed = state.lastPlay?.playerId === p.id;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.oppTile,
                      { width: oppTileSize, height: oppTileSize + 12 },
                      active && styles.oppTileActive,
                    ]}
                  >
                    <LinearGradient
                      colors={
                        active
                          ? ['#F59E0B', '#FBBF24']
                          : p.isBot
                          ? ['#EC4899', '#8B5CF6']
                          : ['#7C3AED', '#A855F7']
                      }
                      style={[styles.oppAvatar, { width: oppAvatarSize, height: oppAvatarSize, borderRadius: oppAvatarSize / 2 }]}
                    >
                      <Ionicons name={p.isBot ? 'hardware-chip' : 'person'} size={oppAvatarSize * 0.55} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.oppName} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.oppMeta}>
                      <Ionicons name="albums" size={8} color="#fff" />
                      <Text style={styles.oppMetaText}>{p.hand.length}</Text>
                    </View>
                    {active && (
                      <View style={styles.turnBadge}>
                        <Text style={styles.turnBadgeText}>♦</Text>
                      </View>
                    )}
                    {justPlayed && state.phase === 'challenging' && (
                      <View style={styles.playedBadge}>
                        <Text style={styles.playedBadgeText}>
                          {formatDeclaredValue(state.lastPlay!.declaredValue)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Quitter */}
          <TouchableOpacity onPress={handleQuit} style={styles.quitBtn}>
            <Ionicons name="exit-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* ─── BADGE VALEUR VERROUILLÉE ─── */}
        {isLockedValue && (
          <View style={styles.lockedBadge}>
            <Ionicons name="lock-closed" size={12} color="#fff" />
            <Text style={styles.lockedText}>
              Valeur verrouillée: {formatDeclaredValue(state.currentDeclaredValue!)}
            </Text>
          </View>
        )}

        {/* ─── PLATEAU (table ovale verte) ─── */}
        <View style={styles.boardArea}>
          <LinearGradient
            colors={['#065F46', '#047857', '#064E3B']}
            style={styles.boardTable}
            start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }}
          >
            <GameTableComponent
              pile={state.pile}
              lastPlay={state.lastPlay}
              lastChallenge={state.lastChallenge}
              players={state.players}
              currentPlayerId={currentPlayer?.id || ''}
              showReveal={showReveal}
            />

            {/* Bouton KDOUB rouge — visible UNIQUEMENT à mon tour pendant challenging */}
            {canChallenge && (
              <View style={styles.challengeBar}>
                <TouchableOpacity onPress={handleKdoub} activeOpacity={0.85}>
                  <LinearGradient colors={['#DC2626', '#EF4444']} style={styles.kdoubBtn}>
                    <Ionicons name="warning" size={20} color="#fff" />
                    <Text style={styles.kdoubBtnText}>KDOUB !</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>

          {/* Status de tour */}
          <View style={styles.turnStatus}>
            <Text style={styles.turnStatusText}>
              {state.phase === 'playing' && isMyTurn && '🎯 À toi de jouer !'}
              {state.phase === 'playing' && !isMyTurn && `⏳ ${currentPlayer?.name} réfléchit…`}
              {state.phase === 'challenging' && canPlayDuringChallenge && '🔔 KDOUB ! ou pose une carte'}
              {state.phase === 'challenging' && !canPlayDuringChallenge && `⏳ ${decisionPlayer?.name} décide…`}
              {state.phase === 'revealing' && '🔍 Révélation…'}
              {state.phase === 'round_end' && '🏁 Fin de manche'}
              {state.phase === 'game_over' && '🏆 Partie terminée'}
            </Text>
          </View>
        </View>

        {/* ─── MA MAIN EN BAS ─── */}
        {myPlayer && myPlayer.hand.length > 0 && (
          <View style={styles.myHandArea}>
            <HandComponent
              cards={myPlayer.hand}
              selectedIndex={selectedCardIndex}
              onSelectCard={handleSelectCard}
              disabled={!(isMyTurn || canPlayDuringChallenge)}
              isCurrentPlayer={isMyTurn || canPlayDuringChallenge}
              label={
                isMyTurn
                  ? 'TA MAIN · TAPE UNE CARTE'
                  : canPlayDuringChallenge
                  ? 'TON TOUR · KDOUB ! ou pose une carte'
                  : 'Ta main (en attente)'
              }
            />
          </View>
        )}

        {/* ─── MODALE VALUE SELECTOR ─── */}
        <ValueSelector
          visible={showValueSelector}
          onSelect={handleDeclareValue}
          onCancel={() => {
            setShowValueSelector(false);
            setSelectedCardIndex(null);
          }}
        />

        {/* ─── OVERLAY FIN DE PARTIE ─── */}
        {state.phase === 'game_over' && state.winnerId && (
          <View style={styles.endOverlay}>
            <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.endCard}>
              <Ionicons name="trophy" size={56} color="#fff" />
              <Text style={styles.endTitle}>
                {state.winnerId === myId
                  ? '🏆 Tu as gagné !'
                  : `${state.players.find(p => p.id === state.winnerId)?.name} gagne la partie`}
              </Text>
              <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.endBtn}>
                <Text style={styles.endBtnText}>Retour au menu</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1, backgroundColor: '#0A0A1A',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  loadingText: { color: '#C084FC', fontSize: 14, fontFamily: 'Inter-SemiBold' },
  root: { flex: 1 },

  // ─── TOP STRIP (video + avatars) ───
  topStrip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 6, gap: 8,
    height: 80,
  },
  myTile: {
    width: 90, height: 70, borderRadius: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: '#7C3AED',
    position: 'relative',
    backgroundColor: '#1E1B3A',
  },
  myCamOff: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  myLabel: {
    position: 'absolute', bottom: 2, left: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: 999,
  },
  myLabelText: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Bold' },
  tileBtns: { position: 'absolute', top: 2, right: 2, flexDirection: 'row', gap: 2 },
  tileBtn: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  tileBtnOff: { backgroundColor: 'rgba(239,68,68,0.9)' },

  oppRow: { gap: 6, paddingHorizontal: 4, alignItems: 'center' },
  oppFlex: {
    flex: 1, flexDirection: 'row',
    justifyContent: 'space-evenly', alignItems: 'center',
    flexWrap: 'nowrap',
  },
  oppTile: {
    width: 60, height: 72, borderRadius: 8,
    backgroundColor: 'rgba(30,27,58,0.75)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    gap: 2,
  },
  oppTileActive: { borderColor: '#F59E0B', borderWidth: 2, transform: [{ scale: 1.05 }] },
  oppAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  oppName: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Bold', maxWidth: 54 },
  oppMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(124,58,237,0.8)',
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 999,
  },
  oppMetaText: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Black' },
  turnBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#F59E0B', width: 16, height: 16,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  turnBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  playedBadge: {
    position: 'absolute', top: -6, left: -4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  playedBadgeText: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Black' },

  quitBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
  },

  // ─── LOCKED VALUE ───
  lockedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 999, marginVertical: 4,
  },
  lockedText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },

  // ─── BOARD ───
  boardArea: { flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center' },
  boardTable: {
    width: '100%', flex: 1,
    borderRadius: 180,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#10B981',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
    maxHeight: 340,
  },
  challengeBar: {
    position: 'absolute', bottom: 10,
    flexDirection: 'row', gap: 10,
  },
  kdoubBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 22, paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#DC2626', shadowOpacity: 0.8, shadowRadius: 8, elevation: 8,
  },
  kdoubBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black', letterSpacing: 2 },
  passBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  passBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  turnStatus: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 999,
  },
  turnStatusText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },

  // ─── MY HAND ───
  myHandArea: {
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  // ─── END OVERLAY ───
  endOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  endCard: { padding: 30, borderRadius: 20, alignItems: 'center', gap: 14 },
  endTitle: { color: '#fff', fontSize: 22, fontFamily: 'Inter-Black', textAlign: 'center' },
  endBtn: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999,
  },
  endBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
});
