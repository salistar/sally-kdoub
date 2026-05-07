/**
 * @file ExternalJitsiCall.tsx
 * @description Jitsi Local : EMBEDDED dans l'app via WebView (pas de Chrome
 * Custom Tab qui donne l'impression d'un navigateur séparé).
 *
 * Limitation connue : Android WebView sur HTTP n'expose pas getUserMedia
 * (secure context requis), donc la vidéo locale ne sera pas capturée.
 * L'UI Jitsi s'affiche quand même — on voit la salle, le chat, les tiles
 * des autres participants, etc.
 *
 * Pour la VRAIE vidéo locale, bouton secondaire "Ouvrir avec vidéo" qui
 * bascule sur Chrome externe (Linking.openURL) — l'utilisateur choisit.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking,
  ScrollView, Platform, PermissionsAndroid,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { logger } from '../utils/logger';

const log = logger.scoped('JitsiLocal');

let WebView: any = null;
try { WebView = require('react-native-webview').WebView; } catch {}

interface SimulatedPeer {
  userId: string;
  username: string;
  isSimulated?: boolean;
  isHost?: boolean;
}

interface Props {
  roomCode: string;
  displayName: string;
  host: string;
  proto?: 'http' | 'https';
  simulatedPeers?: SimulatedPeer[];
  onClose?: () => void;
}

async function requestPerms() {
  if (Platform.OS !== 'android') return;
  try {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
  } catch {}
}

export default function ExternalJitsiCall({
  roomCode, displayName, host, proto, simulatedPeers = [], onClose,
}: Props) {
  const [mode, setMode] = useState<'choice' | 'embedded' | 'loaded'>('choice');

  const isLan = /^\d+\.\d+\.\d+\.\d+/.test(host) || host.includes('localhost');
  const resolvedProto = proto || (isLan ? 'http' : 'https');
  const roomName = `sallycards-${roomCode.toUpperCase()}`;
  const url = `${resolvedProto}://${host}/${encodeURIComponent(roomName)}#userInfo.displayName=%22${encodeURIComponent(displayName)}%22&config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.startAudioOnly=false`;

  useEffect(() => {
    log.screen('mounted', 'host=' + host);
  }, []);

  // JS injecté AVANT chargement → force secure context pour que Jitsi démarre
  const preInject = `
    (function() {
      try {
        Object.defineProperty(window, 'isSecureContext', { get: () => true, configurable: true });
      } catch (e) {}
      // Polyfill mediaDevices vide (évite crash) — la vidéo ne fonctionnera
      // PAS en HTTP mais Jitsi affichera au moins l'UI.
      if (!navigator.mediaDevices) {
        try {
          Object.defineProperty(navigator, 'mediaDevices', {
            value: {
              getUserMedia: () => Promise.reject(new Error('Vidéo indispo en HTTP — utilise "Ouvrir avec vidéo"')),
              enumerateDevices: () => Promise.resolve([]),
            },
          });
        } catch (e) {}
      }
      true;
    })();
  `;

  const handleEmbedded = async () => {
    await requestPerms();
    log.explain('mode WebView embedded (Jitsi local, sans vidéo)');
    setMode('embedded');
  };

  const handleExternal = async () => {
    log.explain(`ouverture Chrome externe pour vidéo native : ${url}`);
    await Linking.openURL(url);
  };

  if (mode === 'choice') {
    return (
      <LinearGradient colors={['#1E1B3A', '#4C1D95']} style={styles.card}>
        {/* Grille avatars bots */}
        {simulatedPeers.length > 0 && (
          <>
            <Text style={styles.peersLabel}>
              {simulatedPeers.length} participant{simulatedPeers.length > 1 ? 's' : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 70 }}>
              {simulatedPeers.map((p) => (
                <View key={p.userId} style={styles.peerTile}>
                  <LinearGradient
                    colors={p.isSimulated ? ['#EC4899', '#8B5CF6'] : ['#7C3AED', '#A855F7']}
                    style={styles.peerAvatar}
                  >
                    <Ionicons name={p.isSimulated ? 'hardware-chip' : 'person'} size={14} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.peerName} numberOfLines={1}>{p.username}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={styles.divider} />

        <Ionicons name="videocam" size={28} color="#F59E0B" />
        <Text style={styles.title}>Jitsi Local</Text>
        <Text style={styles.sub}>Serveur : {host}</Text>

        {/* 2 options distinctes */}
        <TouchableOpacity onPress={handleEmbedded} style={styles.btnPrimary}>
          <LinearGradient colors={['#7C3AED', '#EC4899']} style={styles.btnGrad}>
            <Ionicons name="phone-portrait" size={16} color="#fff" />
            <Text style={styles.btnText}>Ouvrir dans l'app (sans vidéo)</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleExternal} style={styles.btnSecondary}>
          <View style={styles.btnSecondaryInner}>
            <Ionicons name="globe" size={14} color="#F59E0B" />
            <Text style={styles.btnSecondaryText}>Ouvrir Chrome externe (avec vidéo)</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={12} color="#FCD34D" />
          <Text style={styles.infoText}>
            Vidéo HTTP bloquée par Android. Pour la vidéo réelle locale, utiliser
            Chrome externe OU un dev build EAS avec cert valide.
          </Text>
        </View>

        {!!onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}
      </LinearGradient>
    );
  }

  // Mode embedded : WebView plein conteneur
  if (!WebView) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>react-native-webview indispo</Text>
      </View>
    );
  }

  return (
    <View style={styles.embedded}>
      {mode === 'embedded' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#C084FC" />
          <Text style={styles.loaderText}>Connexion à {host}…</Text>
        </View>
      )}
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={preInject}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        originWhitelist={['*']}
        onLoadEnd={() => setMode('loaded')}
        onError={(e: any) => log.error('WebView error', e?.nativeEvent)}
        onPermissionRequest={(e: any) => {
          const res = e?.nativeEvent?.resources || [];
          try { e?.nativeEvent?.grant?.(res); } catch {}
        }}
      />
      {/* Barre de contrôle en bas pour rebasculer vers Chrome externe */}
      <View style={styles.controlBar}>
        <TouchableOpacity onPress={handleExternal} style={styles.controlBtn}>
          <Ionicons name="globe" size={14} color="#fff" />
          <Text style={styles.controlText}>Chrome externe (vidéo)</Text>
        </TouchableOpacity>
        {!!onClose && (
          <TouchableOpacity onPress={onClose} style={styles.controlBtn}>
            <Ionicons name="close" size={14} color="#fff" />
            <Text style={styles.controlText}>Fermer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, padding: 12, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    position: 'relative',
  },
  peersLabel: {
    color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter-Bold',
    letterSpacing: 1, textTransform: 'uppercase', alignSelf: 'flex-start', marginLeft: 6,
  },
  peerTile: { alignItems: 'center', marginRight: 10, width: 56 },
  peerAvatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  peerName: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Bold', marginTop: 2, maxWidth: 52 },
  divider: { width: '90%', height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  title: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter-Regular' },

  btnPrimary: { borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  btnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  btnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },

  btnSecondary: { marginTop: 6 },
  btnSecondaryInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245,158,11,0.5)',
  },
  btnSecondaryText: { color: '#F59E0B', fontSize: 11, fontFamily: 'Inter-Bold' },

  info: {
    flexDirection: 'row', gap: 4, alignItems: 'flex-start',
    marginTop: 8, padding: 6,
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 6,
  },
  infoText: { flex: 1, color: 'rgba(252,211,77,0.85)', fontSize: 9, lineHeight: 12 },
  closeBtn: { position: 'absolute', top: 6, right: 6 },

  embedded: { flex: 1, backgroundColor: '#0A0A1A' },
  webview: { flex: 1, backgroundColor: '#0A0A1A' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(10,10,26,0.9)', zIndex: 1, gap: 6,
  },
  loaderText: { color: '#E9D5FF', fontSize: 11, fontFamily: 'Inter-SemiBold' },
  controlBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.8)', padding: 6, gap: 6,
  },
  controlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(124,58,237,0.7)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  controlText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Bold' },

  error: {
    padding: 16, margin: 8, borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center', gap: 6,
  },
  errorText: { color: '#FCA5A5', fontSize: 11, textAlign: 'center' },
});
