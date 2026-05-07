/**
 * @file P2PCall.tsx
 * @description Appel audio/vidéo 100% Expo Go compatible.
 *
 * Architecture révisée après test — WebView Android dans Expo Go bloque
 * `navigator.mediaDevices` silencieusement, empêchant tout WebRTC navigateur.
 * On utilise donc :
 *   - `expo-camera` pour le stream caméra local (module natif dans Expo Go)
 *   - Le socket-server (/webrtc namespace) pour le signaling (déjà testé OK)
 *   - Avatars tiles pour les peers simulés (ils n'ont pas de caméra réelle)
 *
 * Résultat : TA caméra s'affiche, les bots sont visibles comme avatars
 * animés, le signaling fonctionne (logs Metro le montrent). Pour avoir un
 * VRAI peer-to-peer avec vidéo entre devices, un dev build EAS avec
 * react-native-webrtc est requis.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, PermissionsAndroid,
  ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { logger } from '../utils/logger';
import { SOCKET_URL } from '../../shared/api';

// expo-camera : import défensif
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const c = require('expo-camera');
  CameraView = c.CameraView;
  useCameraPermissions = c.useCameraPermissions;
} catch {}

const log = logger.scoped('P2PCall');

interface SimulatedPeer {
  userId: string;
  username: string;
  isSimulated?: boolean;
  isHost?: boolean;
}

interface Props {
  roomCode: string;
  displayName: string;
  authToken: string;
  /** Peers simulés affichés en grille même sans connexion socket effective */
  simulatedPeers?: SimulatedPeer[];
  onClose?: () => void;
}

interface Peer {
  userId: string;
  username: string;
  socketId: string;
  isSimulated?: boolean;
  isHost?: boolean;
}

async function ensureAudioPermission() {
  if (Platform.OS !== 'android') return true;
  try {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return true; }
}

export default function P2PCall({ roomCode, displayName, authToken, simulatedPeers = [], onClose }: Props) {
  const [camPermission, requestCamPermission] = (useCameraPermissions as any)?.() ?? [null, () => {}];
  const [micOk, setMicOk] = useState(false);
  // Pré-remplir avec les peers simulés → les avatars s'affichent
  // immédiatement, pas d'attente socket
  const [peers, setPeers] = useState<Peer[]>(
    simulatedPeers.map((p) => ({
      userId: p.userId,
      username: p.username,
      socketId: `sim-${p.userId}`,
      isSimulated: true,
      isHost: p.isHost,
    })),
  );
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [status, setStatus] = useState<string>('Initialisation…');
  const socketRef = useRef<Socket | null>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    log.screen('mounted', 'room=' + roomCode + ' user=' + displayName);
    (async () => {
      if (CameraView && camPermission && !camPermission.granted) {
        log.explain('demande permission caméra (expo-camera)');
        await requestCamPermission();
      }
      const m = await ensureAudioPermission();
      setMicOk(m);
      log.explain(`permissions: cam=${camPermission?.granted} mic=${m}`);
    })();

    // Animation pulse pour indiquer l'activité
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Connexion au signaling socket une fois permissions OK
  useEffect(() => {
    if (!camPermission?.granted || !micOk) return;
    if (socketRef.current) return;

    setStatus('Connexion au signaling…');
    log.bin('connect socket /webrtc');

    const sock = io(`${SOCKET_URL}/webrtc`, {
      auth: { token: authToken },
      transports: ['websocket'],
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      setStatus('Connecté · rejoint la room');
      log.bout('socket connected, emit webrtc:join');
      sock.emit('webrtc:join', { roomCode });
    });

    sock.on('webrtc:peers', (data: { peers: Peer[]; me: Peer }) => {
      log.bout('webrtc:peers', `${data.peers.length} peers déjà présents`);
      setPeers(data.peers);
      setStatus(`Dans la room · ${data.peers.length + 1} participant(s)`);
    });

    sock.on('webrtc:joined', (peer: Peer) => {
      log.bout('webrtc:joined', peer.username);
      setPeers((p) => [...p, peer]);
      setStatus(`🙋 ${peer.username} a rejoint`);
    });

    sock.on('webrtc:left', (data: { socketId: string; userId: string }) => {
      log.bout('webrtc:left', data.userId);
      setPeers((p) => p.filter((x) => x.socketId !== data.socketId));
    });

    sock.on('connect_error', (e: any) => {
      log.error('socket connect_error', e?.message);
      setStatus('Erreur signaling: ' + e?.message);
    });
  }, [camPermission?.granted, micOk, authToken, roomCode]);

  if (!CameraView) {
    return (
      <View style={styles.error}>
        <Ionicons name="alert-circle" size={32} color="#EF4444" />
        <Text style={styles.errorText}>expo-camera n'est pas chargé</Text>
      </View>
    );
  }

  if (!camPermission) {
    return <View style={styles.center}><ActivityIndicator color="#C084FC" /></View>;
  }

  if (!camPermission.granted) {
    return (
      <LinearGradient colors={['#1E1B3A', '#4C1D95']} style={styles.ctaCard}>
        <Ionicons name="videocam" size={32} color="#EC4899" />
        <Text style={styles.ctaTitle}>Caméra requise</Text>
        <Text style={styles.ctaSub}>L'accès caméra n'a pas été accordé</Text>
        <TouchableOpacity onPress={requestCamPermission} style={styles.ctaBtn}>
          <LinearGradient colors={['#7C3AED', '#EC4899']} style={styles.ctaBtnGrad}>
            <Text style={styles.ctaBtnText}>Autoriser la caméra</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <View style={styles.root}>
      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>{status}</Text>
        {!!onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Ma caméra (natif expo-camera) */}
      <View style={styles.myTile}>
        {camOn ? (
          <CameraView style={styles.camera} facing="front" mute={!micOn} />
        ) : (
          <View style={styles.cameraOff}>
            <Ionicons name="videocam-off" size={40} color="#6B7280" />
            <Text style={styles.cameraOffText}>Caméra coupée</Text>
          </View>
        )}
        <View style={styles.myLabel}>
          <Text style={styles.myLabelText}>{displayName} (moi)</Text>
          {!micOn && <Ionicons name="mic-off" size={12} color="#fff" style={{ marginLeft: 4 }} />}
        </View>
      </View>

      {/* Grille des peers (avatars animés puisqu'ils sont simulés) */}
      {peers.length > 0 && (
        <View style={styles.peersGrid}>
          {peers.map((p, idx) => (
            <Animated.View
              key={p.socketId}
              style={[
                styles.peerTile,
                { transform: [{ scale: idx % 2 ? pulseScale : 1 }], opacity: pulseOpacity },
              ]}
            >
              <LinearGradient
                colors={['#7C3AED', '#EC4899']}
                style={styles.peerAvatar}
              >
                <Ionicons name="person" size={20} color="#fff" />
              </LinearGradient>
              <Text style={styles.peerName} numberOfLines={1}>
                {p.username}
              </Text>
              <View style={styles.peerStatus}>
                <Ionicons name="ellipse" size={6} color="#22C55E" />
                <Text style={styles.peerStatusText}>connecté</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => setMicOn((v) => !v)}
          style={[styles.ctrlBtn, !micOn && styles.ctrlBtnOff]}
        >
          <Ionicons name={micOn ? 'mic' : 'mic-off'} size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setCamOn((v) => !v)}
          style={[styles.ctrlBtn, !camOn && styles.ctrlBtnOff]}
        >
          <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A1A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A1A' },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderBottomWidth: 1, borderColor: 'rgba(124,58,237,0.5)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-SemiBold', flex: 1 },
  closeBtn: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: 4 },

  myTile: {
    aspectRatio: 4 / 3, borderRadius: 8, overflow: 'hidden',
    marginHorizontal: 8, marginTop: 8,
    borderWidth: 2, borderColor: '#7C3AED',
  },
  camera: { flex: 1 },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1B3A', gap: 6 },
  cameraOffText: { color: '#6B7280', fontSize: 12 },
  myLabel: {
    position: 'absolute', bottom: 6, left: 6,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  myLabelText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Bold' },

  peersGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    paddingHorizontal: 8, paddingTop: 6, gap: 6,
  },
  peerTile: {
    width: '30%', aspectRatio: 1,
    backgroundColor: '#1E1B3A', borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  peerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  peerName: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Bold', maxWidth: '90%' },
  peerStatus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  peerStatusText: { color: '#9CA3AF', fontSize: 8 },

  controls: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 12,
  },
  ctrlBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(124,58,237,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctrlBtnOff: { backgroundColor: 'rgba(239,68,68,0.9)' },

  ctaCard: {
    margin: 12, padding: 18, borderRadius: 14,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(236,72,153,0.3)',
  },
  ctaTitle: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  ctaSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, textAlign: 'center' },
  ctaBtn: { borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  ctaBtnGrad: { paddingHorizontal: 18, paddingVertical: 8 },
  ctaBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },

  error: {
    padding: 16, margin: 8, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center', gap: 6,
  },
  errorText: { color: '#FCA5A5', fontSize: 11, textAlign: 'center' },
});
