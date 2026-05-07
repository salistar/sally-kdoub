/**
 * @file JitsiCall.tsx
 * @description Audio/video call via Jitsi Meet public server inside a
 * WebView. Works in Expo Go (no native WebRTC module required) — the web
 * page uses the platform's browser-WebRTC APIs (`getUserMedia`) which the
 * WebView relays to the OS once the user grants mic/camera permissions.
 *
 * Reference: https://www.daily.co/blog/deploying-webrtc-on-an-expo-react-native-app-2/
 * (same "WebView wrapping a web-based call UI" pattern).
 *
 * Every SallyCards room code becomes a Jitsi room: `sallycards-<CODE>`.
 * So every participant of the SallyCards room automatically joins the
 * same Jitsi conference.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, PermissionsAndroid } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { logger } from '../utils/logger';

const log = logger.scoped('JitsiCall');

// react-native-webview — chargé défensivement
let WebView: any = null;
let webviewAvailable = false;
try {
  WebView = require('react-native-webview').WebView;
  webviewAvailable = true;
} catch {
  webviewAvailable = false;
}

interface Props {
  roomCode: string;
  displayName: string;
  /** Called when the user closes the call overlay */
  onClose?: () => void;
  /** Full-screen overlay vs embedded panel */
  fullscreen?: boolean;
  /** Override the Jitsi host (useful for local Docker: "192.168.0.145:8443") */
  hostOverride?: string;
  /** Peers simulés : affichés en overlay mini-tiles sur la WebView */
  simulatedPeers?: { userId: string; username: string; isSimulated?: boolean; isHost?: boolean }[];
}

/**
 * Jitsi server choice.
 *
 * meet.jit.si (official) now REQUIRES a Google/GitHub login to create
 * meetings (since late 2024). We route instead to public Jitsi instances
 * that do NOT require auth. Fallback chain:
 *   1. meet.ffmuc.net   (FFMUC e.V., Munich — free, anon, reliable)
 *   2. meet.calyx.net   (Calyx Institute — free, anon)
 *   3. jitsi.riot.im    (Element / Matrix Foundation — free, anon)
 * Set EXPO_PUBLIC_JITSI_HOST to override.
 */
// 10+ instances Jitsi publiques sans login (fallback chain). Le 1er qui
// répond gagne — dès qu'on détecte une erreur réseau, on passe au suivant.
const JITSI_HOSTS = [
  process.env.EXPO_PUBLIC_JITSI_HOST,
  'meet.ffmuc.net',          // FFMUC Munich (historique, fiable)
  'meet.calyx.net',          // Calyx Institute NYC
  'jitsi.riot.im',           // Matrix/Element
  'jitsi.hackerspace.pl',    // Hackerspace Warsaw
  'meet.guifi.net',          // Guifi.net Barcelona (mesh network)
  'meet.fem-net.de',         // FEM e.V. Ilmenau
  'jitsi.gratis',            // Gratis.party (Netherlands)
  'meet.fosdem.org',         // FOSDEM conferences
  'meet.kde.org',            // KDE community
  'jitsi.chaos.coop',        // Chaos collective
  'meet.linuxplazza.org',    // Linux community
  'jitsi.opencloud.lu',      // OpenCloud Luxembourg
].filter(Boolean) as string[];

const JITSI_HOST = JITSI_HOSTS[0];

/**
 * Jitsi Meet URL builder. Jitsi expects FLAT hash params (not JSON blobs),
 * one per config key. Example: `#config.disableDeepLinking=true`.
 * The mobile "How do you want to join" landing page is suppressed via a
 * combination of hash params AND a desktop user-agent override on the
 * WebView (see userAgent prop below).
 */
function buildJitsiUrl(roomCode: string, displayName: string, host: string = JITSI_HOST): string {
  const roomName = `sallycards-${roomCode.toUpperCase()}`;
  // Protocole : http:// pour les IPs LAN (port 8000 Jitsi local, évite le
  // rejet de cert auto-signé), https:// pour les serveurs publics.
  const isLan = /^\d+\.\d+\.\d+\.\d+/.test(host) || host.startsWith('localhost') || host.endsWith('.local');
  const proto = isLan ? 'http' : 'https';

  const params: string[] = [
    `userInfo.displayName="${encodeURIComponent(displayName)}"`,
    'config.prejoinConfig.enabled=false',
    'config.prejoinPageEnabled=false',
    'config.disableDeepLinking=true',
    'config.disableProfile=true',
    'config.requireDisplayName=false',
    'config.startWithAudioMuted=false',
    'config.startWithVideoMuted=false',
    'config.enableClosePage=false',
    'config.disableInviteFunctions=true',
    'config.enableWelcomePage=false',
    'interfaceConfig.MOBILE_APP_PROMO=false',
    'interfaceConfig.SHOW_JITSI_WATERMARK=false',
    'interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false',
    'interfaceConfig.SHOW_BRAND_WATERMARK=false',
    'interfaceConfig.SHOW_CHROME_EXTENSION_BANNER=false',
    'interfaceConfig.SHOW_POWERED_BY=false',
    'interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true',
    'interfaceConfig.DEFAULT_BACKGROUND="#0A0A1A"',
    'interfaceConfig.DEFAULT_REMOTE_DISPLAY_NAME="SallyCards"',
    'interfaceConfig.TOOLBAR_BUTTONS=["microphone","camera","tileview","hangup","fullscreen","settings"]',
  ];

  return `${proto}://${host}/${encodeURIComponent(roomName)}#${params.join('&')}`;
}

// Desktop Chrome user-agent — makes Jitsi skip the mobile landing page.
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function requestPermissions() {
  if (Platform.OS !== 'android') return true;
  try {
    // Only include permissions that actually exist in this RN version.
    // MODIFY_AUDIO_SETTINGS lives in AndroidManifest.xml, not runtime.
    const perms = ([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ] as any[]).filter((p) => typeof p === 'string' && p.length > 0) as string[];

    if (perms.length === 0) {
      log.warn('aucune permission runtime à demander — on continue');
      return true;
    }

    const res = await PermissionsAndroid.requestMultiple(perms as any);
    const allGranted = Object.values(res).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED,
    );
    log.explain(`permissions Android ${allGranted ? 'accordées' : 'refusées'}`);
    return allGranted;
  } catch (e: any) {
    log.error('requestPermissions failed', e?.message || String(e));
    // Even on failure, let the WebView try — the OS will re-prompt when
    // the page calls getUserMedia.
    return true;
  }
}

export default function JitsiCall({
  roomCode,
  displayName,
  onClose,
  fullscreen = false,
  hostOverride,
  simulatedPeers = [],
}: Props) {
  const [ready, setReady] = useState(false);
  const [loadingWebView, setLoadingWebView] = useState(true);
  const [permOk, setPermOk] = useState(false);
  const [hostIndex, setHostIndex] = useState(0);
  // hostOverride (Jitsi local Docker) prime sur la liste publique
  const hosts = hostOverride ? [hostOverride] : JITSI_HOSTS;
  const activeHost = hosts[hostIndex] || 'meet.ffmuc.net';

  useEffect(() => {
    log.screen('mounted', 'room=' + roomCode + ' user=' + displayName + ' host=' + activeHost);
  }, []);

  const startCall = async () => {
    log.explain('demande permissions micro + caméra avant de charger Jitsi');
    const ok = await requestPermissions();
    setPermOk(ok);
    setReady(true);
  };

  const tryNextHost = () => {
    if (hostIndex < hosts.length - 1) {
      const next = hosts[hostIndex + 1];
      log.warn(`${activeHost} a échoué, bascule sur ${next}`);
      setLoadingWebView(true);
      setHostIndex(hostIndex + 1);
    } else {
      log.error('Tous les serveurs Jitsi ont échoué', hosts);
    }
  };

  if (!webviewAvailable) {
    return (
      <View style={styles.error}>
        <Ionicons name="alert-circle" size={32} color="#EF4444" />
        <Text style={styles.errorText}>
          react-native-webview n'est pas chargé — appel audio/vidéo impossible.
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <LinearGradient colors={['#1E1B3A', '#2A1F4D']} style={styles.ctaCard}>
        <Ionicons name="videocam" size={32} color="#C084FC" />
        <Text style={styles.ctaTitle}>Appel audio + vidéo</Text>
        <Text style={styles.ctaSub}>
          Tous les joueurs de cette room rejoindront automatiquement la même conférence.
        </Text>
        <TouchableOpacity onPress={startCall} activeOpacity={0.85} style={styles.ctaBtn}>
          <LinearGradient
            colors={['#7C3AED', '#C026D3']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.ctaBtnGrad}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>Rejoindre l'appel</Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const url = buildJitsiUrl(roomCode, displayName, activeHost);

  return (
    <View style={fullscreen ? styles.fullscreen : styles.embedded}>
      {loadingWebView && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#C084FC" />
          <Text style={styles.loaderText}>Connexion à {activeHost}…</Text>
        </View>
      )}
      <WebView
        key={activeHost}
        source={{ uri: url }}
        style={styles.webview}
        userAgent={DESKTOP_USER_AGENT}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        allowsProtectedMedia
        mixedContentMode="always"
        originWhitelist={['https://*', 'http://*']}
        androidLayerType="hardware"
        cacheEnabled={false}
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        // Android : auto-grant camera/mic quand la page appelle getUserMedia
        // grant() peut être sur event ou event.nativeEvent selon la version
        // de react-native-webview — on essaye les deux.
        onPermissionRequest={(event: any) => {
          const resources = event?.nativeEvent?.resources || event?.resources || [
            'android.webkit.resource.VIDEO_CAPTURE',
            'android.webkit.resource.AUDIO_CAPTURE',
          ];
          log.explain('WebView permission request: ' + resources.join(','));
          try { event?.nativeEvent?.grant?.(resources); } catch {}
          try { event?.grant?.(resources); } catch {}
        }}
        // iOS : auto-grant pour Jitsi (même domaine)
        mediaCapturePermissionGrantType="grant"
        // Bloquer l'ouverture d'apps externes (deep links jitsi-meet://)
        onShouldStartLoadWithRequest={(req: any) => {
          const u = req?.url || '';
          if (u.startsWith('jitsi-meet://') || u.startsWith('intent://') || u.startsWith('market://')) {
            log.warn('bloqué deep link externe: ' + u.substring(0, 80));
            return false;
          }
          // Detect forced auth redirect (account chooser) → try next server
          if (u.includes('accounts.google.com') || u.includes('github.com/login')) {
            log.warn(`${activeHost} redirige vers auth → fallback`);
            setTimeout(tryNextHost, 100);
            return false;
          }
          return true;
        }}
        onLoadEnd={() => setLoadingWebView(false)}
        onMessage={(e: any) => log.explain('jitsi msg ' + (e?.nativeEvent?.data || '').substring(0, 120))}
        onError={(e: any) => {
          log.error('webview error', e?.nativeEvent);
          tryNextHost();
        }}
        onHttpError={(e: any) => {
          const status = e?.nativeEvent?.statusCode;
          if (status >= 400) {
            log.warn(`${activeHost} HTTP ${status} → fallback`);
            tryNextHost();
          }
        }}
      />

      {/* Overlay : mini-tiles des bots simulés (en bas du WebView) */}
      {simulatedPeers.length > 0 && (
        <View style={styles.peersOverlay}>
          {simulatedPeers.map((p) => (
            <View key={p.userId} style={styles.peerMini}>
              <LinearGradient
                colors={p.isSimulated ? ['#EC4899', '#8B5CF6'] : ['#7C3AED', '#A855F7']}
                style={styles.peerMiniAvatar}
              >
                <Ionicons name={p.isSimulated ? 'hardware-chip' : 'person'} size={12} color="#fff" />
              </LinearGradient>
              <Text style={styles.peerMiniName} numberOfLines={1}>
                {p.username}
              </Text>
            </View>
          ))}
        </View>
      )}
      {!!onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close-circle" size={30} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ctaCard: {
    margin: 12, padding: 20, borderRadius: 16,
    alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: 'rgba(192,132,252,0.3)',
  },
  ctaTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Bold', marginTop: 6 },
  ctaSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  ctaBtn: { marginTop: 10, borderRadius: 999, overflow: 'hidden' },
  ctaBtnGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 22, paddingVertical: 10,
  },
  ctaBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },

  embedded: {
    height: 260,
    marginHorizontal: 12, marginTop: 10,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#0A0A1A',
  },
  fullscreen: { flex: 1, backgroundColor: '#0A0A1A' },
  webview: { flex: 1, backgroundColor: '#0A0A1A' },

  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0A0A1A', gap: 10, zIndex: 1,
  },
  loaderText: { color: '#E9D5FF', fontSize: 13, fontFamily: 'Inter-SemiBold' },

  closeBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 18,
  },

  error: {
    padding: 20, marginHorizontal: 12, marginTop: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    alignItems: 'center', gap: 8,
  },
  errorText: { color: '#FCA5A5', fontSize: 12, textAlign: 'center' },

  // Overlay mini-tiles des bots
  peersOverlay: {
    position: 'absolute', bottom: 8, left: 8, right: 8,
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
    justifyContent: 'center',
  },
  peerMini: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(192,132,252,0.5)',
  },
  peerMiniAvatar: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  peerMiniName: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Bold', maxWidth: 60 },
});
