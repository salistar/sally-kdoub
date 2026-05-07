/**
 * @file room/lobby.tsx
 * @description Salon d'attente. Affiche :
 *   - le code partageable (WhatsApp / IG / FB / TikTok via Share natif)
 *   - la liste des joueurs (réels + simulés, badge distinct)
 *   - des tiles vidéo/audio (WebRTC) — chargement défensif
 *   - bouton "Lancer" pour l'hôte dès que minPlayers est atteint
 *
 * WebRTC : react-native-webrtc est chargé dynamiquement avec try/catch —
 * si pas installé (Expo Go standard), on affiche les tiles avatars et un
 * badge "Nécessite un dev build". Dès que la dep est présente, les tiles
 * deviennent des vraies RTCView.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { io, Socket } from 'socket.io-client';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import JitsiCall from '../../src/components/JitsiCall';
import P2PCall from '../../src/components/P2PCall';
import ExternalJitsiCall from '../../src/components/ExternalJitsiCall';
import * as api from '../../shared/api';
import { SOCKET_URL } from '../../shared/api';

type CallMethod = 'jitsi-public' | 'webrtc-p2p' | 'jitsi-local';

const log = logger.scoped('RoomLobby');

export default function LobbyScreen() {
  const { t } = useTranslation();
  const { code, simulated, method } = useLocalSearchParams<{ code: string; simulated?: string; method?: CallMethod }>();
  const callMethod: CallMethod = (method || 'jitsi-public') as CallMethod;
  // Jitsi local auto-détecte le LAN host (même IP que Metro → port 8443).
  // Tu n'as donc plus besoin d'éditer .env quand le Wi-Fi change.
  // Jitsi local via HTTP port 8000 (pas 8443 HTTPS) car WebView RN rejette
  // les certs auto-signés et on ne peut pas bypass en Expo Go.
  const jitsiLocalHost = (() => {
    if (process.env.EXPO_PUBLIC_JITSI_LOCAL_HOST) return process.env.EXPO_PUBLIC_JITSI_LOCAL_HOST;
    if (process.env.EXPO_PUBLIC_JITSI_HOST)       return process.env.EXPO_PUBLIC_JITSI_HOST;
    try {
      const u = new URL(SOCKET_URL);
      return `${u.hostname}:8000`;  // HTTP port (pas 8443 HTTPS)
    } catch {
      return '192.168.0.148:8000';
    }
  })();
  const router = useRouter();
  const { palette } = useTheme();
  const [room, setRoom] = useState<api.RoomFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [me, setMe] = useState<api.User | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const isSimulated = simulated === '1' || !!room?.config?.isSimulated;

  const fetchRoom = useCallback(async () => {
    if (!code) return;
    try {
      const r = await api.findRoomByCode(String(code));
      setRoom(r);
      if (r.status === 'in_progress') {
        log.explain('room passée en in_progress → redirect vers /game');
        router.replace(`/game/${r.code}`);
      }
    } catch (e: any) {
      log.error('fetchRoom failed', e?.message);
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    log.screen('mounted', 'code=' + code + ' simulated=' + simulated);
    (async () => {
      const u = await api.getMe().catch(() => null);
      setMe(u);
    })();
    // Initial fetch
    fetchRoom();

    // Real-time subscription via socket (remplace le poll 3s)
    const token = api.getAuthToken();
    if (token && code) {
      log.explain('connexion socket /lobby pour les updates temps réel');
      const sock = io(`${SOCKET_URL}/lobby`, {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = sock;

      sock.on('connect', () => {
        log.explain(`socket connecté → abonnement à room:${code}`);
        sock.emit('room:subscribe', { code: String(code) });
      });

      sock.on('room:updated', (payload: any) => {
        log.bout('room:updated', { event: payload?.event, players: payload?.room?.playersCount });
        if (payload?.room) {
          setRoom(payload.room);
          if (payload.event === 'started') {
            log.explain('événement started → navigation vers /game');
            router.replace(`/game/${payload.room.code}`);
          }
        }
      });

      sock.on('disconnect', () => log.warn('socket déconnecté'));
      sock.on('connect_error', (e) => log.error('socket connect_error', e?.message));
    }

    return () => {
      try {
        socketRef.current?.emit('room:unsubscribe', { code: String(code) });
        socketRef.current?.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [fetchRoom]);

  // Note: audio/vidéo est géré par <JitsiCall /> (WebView meet.jit.si) qui
  // demande lui-même les permissions micro/caméra et gère mute/unmute dans
  // son propre UI Jitsi. Pas besoin de streams natifs côté lobby.

  const handleShare = async (platform: string) => {
    if (!room) return;
    const msg = `Rejoins-moi sur SallyCards Kdoub ! Code: ${room.code}\n${room.shareUrl}`;
    log.screen('share', platform);
    try {
      await Share.share({ message: msg, url: room.shareUrl, title: `SallyCards Kdoub — ${room.code}` });
      log.explain('partage natif ouvert — l\'utilisateur choisit WA/IG/FB/TT');
    } catch (e) {
      log.error('share failed', e);
    }
  };

  const handleCopy = async () => {
    if (!room) return;
    await Clipboard.setStringAsync(room.code);
    Alert.alert(t('codeCopied'), room.code);
  };

  const handleStart = async () => {
    if (!room) return;
    setStarting(true);
    try {
      log.bin(`POST /rooms/${room.code}/start`);
      const r = await api.startGame(room.code);
      log.bout('200 start', { status: r.status });
      log.explain('host a lancé la partie → game:started broadcast socket');
      router.replace(`/game/${r.code}`);
    } catch (e: any) {
      log.error('start failed', e?.message);
      Alert.alert(t('error'), e?.message || t('cantStartGame'));
    } finally {
      setStarting(false);
    }
  };

  const handleLeave = async () => {
    if (!room) return;
    try {
      await api.leaveRoomFull(room.code);
      log.screen('left room');
      router.back();
    } catch (e) {
      log.error('leave failed', e);
    }
  };

  const styles = createStyles(palette);
  // isHost: match via room.hostId, room.players[0], ou le flag isHost dans players
  // (le backend retourne l'ObjectId pour hostId mais user.id ou user._id côté client)
  const myId = String(me?.id || (me as any)?._id || '');
  const hostIdStr = String(room?.hostId || '');
  const firstPlayerId = String(room?.players?.[0]?.userId || '');
  const hostByFlag = room?.players?.find((p: any) => p.isHost)?.userId;
  const isHost = !!room && !!me && (
    myId === hostIdStr ||
    myId === firstPlayerId ||
    String(hostByFlag) === myId
  );
  const canStart = !!room && isHost && (room.playersCount >= (room.minPlayers || 2));
  if (__DEV__ && room && me) {
    log.screen('host check', `me=${myId} host=${hostIdStr} firstPlayer=${firstPlayerId} → isHost=${isHost}`);
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
        <AppHeader title={t("lobbyTitle")} showBack />
        <ActivityIndicator size="large" color={palette.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
        <AppHeader title={t("lobbyTitle")} showBack />
        <Text style={[styles.empty, { color: palette.text }]}>Room introuvable</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title={isSimulated ? 'Simulation' : 'Salon d\'attente'}
        subtitle={room.code}
        showBack
        rightSlot={
          isSimulated ? (
            <View style={styles.simulBadge}>
              <Ionicons name="flash" size={10} color="#fff" />
              <Text style={styles.simulBadgeText}>SIMUL</Text>
            </View>
          ) : null
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Call panel — composant choisi selon ?method=... */}
        {callOpen ? (
          <View style={{ height: 420, margin: 12, borderRadius: 14, overflow: 'hidden' }}>
            {(() => {
              // Prépare la liste des peers simulés pour les 3 composants call
              const peersForCall = (room.players || [])
                .filter((p: any) => String(p.userId) !== String(me?.id))
                .map((p: any) => ({
                  userId: String(p.userId),
                  username: p.username,
                  isSimulated: !!p.isSimulated,
                  isHost: !!p.isHost,
                }));
              if (callMethod === 'webrtc-p2p') {
                return (
                  <P2PCall
                    roomCode={room.code}
                    displayName={me?.username || t("player")}
                    authToken={api.getAuthToken() || ''}
                    simulatedPeers={peersForCall}
                    onClose={() => setCallOpen(false)}
                  />
                );
              }
              if (callMethod === 'jitsi-local') {
                return (
                  <ExternalJitsiCall
                    roomCode={room.code}
                    displayName={me?.username || t("player")}
                    host={jitsiLocalHost}
                    simulatedPeers={peersForCall}
                    onClose={() => setCallOpen(false)}
                  />
                );
              }
              return (
                <JitsiCall
                  roomCode={room.code}
                  displayName={me?.username || t("player")}
                  simulatedPeers={peersForCall}
                  onClose={() => setCallOpen(false)}
                />
              );
            })()}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setCallOpen(true)}
            activeOpacity={0.85}
            style={{ margin: 12, borderRadius: 16, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={
                callMethod === 'webrtc-p2p' ? ['#7C3AED', '#EC4899']
                : callMethod === 'jitsi-local' ? ['#F59E0B', '#EF4444']
                : ['#2563EB', '#06B6D4']
              }
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Ionicons name="videocam" size={28} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter-Black', letterSpacing: 0.5 }}>
                  Ouvrir l'appel audio/vidéo
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold' }}>
                  {callMethod === 'webrtc-p2p' ? 'WebRTC P2P · notre TURN/STUN + socket signaling'
                   : callMethod === 'jitsi-local' ? `Jitsi Local · ${jitsiLocalHost}`
                   : 'Jitsi Public · meet.ffmuc.net (sans login)'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Avatars simples (tiles remplacent plus RTCView, la vidéo est dans Jitsi) */}
        <View style={styles.tilesGrid}>
          {room.players.map((p) => (
            <View key={p.userId} style={[styles.tile, { borderColor: palette.border }]}>
              <LinearGradient
                colors={(p as any).isSimulated ? [palette.accent, '#EC4899'] : palette.accentGradient}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={(p as any).isSimulated ? 'hardware-chip' : 'person'} size={30} color="#fff" />
              </LinearGradient>
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 4 }}>
                <Text style={[styles.tileName, { color: '#fff', fontSize: 10, fontFamily: 'Inter-Bold' }]} numberOfLines={1}>
                  {String(p.userId) === String(me?.id) ? 'Moi' : p.username}
                  {(p as any).isSimulated && ' 🤖'}
                </Text>
              </View>
            </View>
          ))}
          {Array.from({ length: Math.max(0, room.maxPlayers - room.playersCount) }).map((_, i) => (
            <View key={`empty-${i}`} style={[styles.tile, styles.tileEmpty, { borderColor: palette.border }]}>
              <Ionicons name="person-add-outline" size={24} color={palette.textSecondary} />
              <Text style={[styles.tileName, { color: palette.textSecondary }]}>Place libre</Text>
            </View>
          ))}
        </View>

        {/* Code partageable */}
        <LinearGradient
          colors={palette.accentGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.codeCard}
        >
          <Text style={styles.codeLabel}>CODE D'INVITATION</Text>
          <Text style={styles.codeValue}>{room.code}</Text>
          <View style={styles.shareRow}>
            <TouchableOpacity style={styles.shareBtn} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Copier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('whatsapp')}>
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('instagram')}>
              <Ionicons name="logo-instagram" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Instagram</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.shareRow, { marginTop: 6 }]}>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('facebook')}>
              <Ionicons name="logo-facebook" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Facebook</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('tiktok')}>
              <Ionicons name="logo-tiktok" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>TikTok</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('other')}>
              <Ionicons name="share-social-outline" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Autre</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Players list détaillée */}
        <Text style={[styles.section, { color: palette.textSecondary }]}>
          JOUEURS ({room.playersCount}/{room.maxPlayers})
        </Text>
        <FlatList
          data={room.players}
          scrollEnabled={false}
          keyExtractor={(p) => String(p.userId)}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <LinearGradient
              colors={palette.cardGradient}
              style={[styles.playerRow, { borderColor: palette.border }]}
            >
              <Ionicons
                name="person-circle"
                size={32}
                color={item.isHost ? palette.gold : palette.accent}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.playerName, { color: palette.text }]}>
                  {item.username}
                  {item.isHost && <Text style={{ color: palette.gold }}>  ★</Text>}
                  {(item as any).isSimulated && (
                    <Text style={{ color: palette.accent, fontSize: 11 }}>  🤖 simulé</Text>
                  )}
                </Text>
              </View>
              {item.isReady ? (
                <View style={[styles.readyBadge, { backgroundColor: palette.success }]}>
                  <Text style={styles.readyText}>PRÊT</Text>
                </View>
              ) : (
                <Text style={{ color: palette.textSecondary, fontSize: 11 }}>en attente…</Text>
              )}
            </LinearGradient>
          )}
        />
      </ScrollView>

      {/* Actions footer */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn}>
          <Ionicons name="exit-outline" size={20} color={palette.danger} />
          <Text style={[styles.leaveBtnText, { color: palette.danger }]}>Quitter</Text>
        </TouchableOpacity>
        {isHost && (
          <TouchableOpacity
            onPress={handleStart}
            disabled={!canStart || starting}
            style={{ flex: 1, marginLeft: 10, borderRadius: 14, overflow: 'hidden', opacity: canStart ? 1 : 0.4 }}
          >
            <LinearGradient
              colors={['#16A34A', '#22C55E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.startBtnGrad}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="play" size={22} color="#fff" />
                  <Text style={styles.startBtnText}>Lancer la partie</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// (VideoTile retiré — la vidéo est maintenant gérée par <JitsiCall /> via WebView)

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    empty: { textAlign: 'center', marginTop: 40, fontSize: 16, fontFamily: 'Inter-SemiBold' },
    simulBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#EC4899',
      paddingHorizontal: 8, paddingVertical: 4,
      borderRadius: 999,
    },
    simulBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },

    tilesGrid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: 12, paddingTop: 12,
    },
    tile: {
      width: '31%', aspectRatio: 3 / 4, margin: '1%',
      borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    tileEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent' },
    tileName: { fontSize: 11, fontFamily: 'Inter-SemiBold' },

    webrtcNotice: {
      flexDirection: 'row', gap: 8,
      padding: 10, marginHorizontal: 12, marginTop: 8,
      borderRadius: 10,
      backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    },
    webrtcNoticeText: { flex: 1, fontSize: 11, fontFamily: 'Inter-Regular' },

    callControls: {
      flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10,
    },
    callBtn: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: palette.border,
    },

    codeCard: {
      margin: 16, padding: 16, borderRadius: 18, alignItems: 'center',
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    codeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'Inter-Bold', letterSpacing: 2 },
    codeValue: {
      color: '#fff', fontSize: 40, fontFamily: 'Inter-Black', letterSpacing: 5, marginVertical: 4,
      textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
    },
    shareRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    shareBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      backgroundColor: 'rgba(255,255,255,0.18)',
      paddingVertical: 9, paddingHorizontal: 8, borderRadius: 10,
    },
    shareBtnText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Bold' },

    section: { fontSize: 11, fontFamily: 'Inter-Bold', letterSpacing: 1, marginHorizontal: 20, marginTop: 8, marginBottom: 6 },
    playerRow: {
      flexDirection: 'row', alignItems: 'center',
      padding: 10, borderRadius: 10, marginBottom: 6, borderWidth: 1,
    },
    playerName: { fontSize: 14, fontFamily: 'Inter-Bold' },
    readyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    readyText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },

    actions: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      flexDirection: 'row', padding: 12, gap: 8,
      backgroundColor: palette.bg,
      borderTopWidth: 1, borderColor: palette.border,
    },
    leaveBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1, borderColor: 'rgba(239,68,68,0.5)',
    },
    leaveBtnText: { fontSize: 13, fontFamily: 'Inter-Bold' },
    startBtnGrad: {
      paddingVertical: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    startBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Black', letterSpacing: 1 },
  });
}
