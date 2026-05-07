/**
 * @file room/simulate.tsx
 * @description Mode simulation — 3 méthodes audio/vidéo au choix :
 *   1. Jitsi public (meet.ffmuc.net)        → sans login, marche en Expo Go
 *   2. WebRTC P2P custom                     → notre TURN/STUN + socket signaling
 *   3. Jitsi Docker local (192.168.x.x:8443) → auto-hébergé, aucun service externe
 *
 * Le choix est passé en query param ?method=jitsi-public|webrtc-p2p|jitsi-local
 * au lobby, qui charge le bon composant d'appel.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const log = logger.scoped('SimulateRoom');

type Method = 'jitsi-public' | 'webrtc-p2p' | 'jitsi-local';

const METHODS: {
  key: Method;
  title: string;
  subtitle: string;
  description: string;
  icon: any;
  gradient: [string, string];
  badge: string;
  badgeColor: string;
}[] = [
  {
    key: 'jitsi-public',
    title: 'Jitsi Public',
    subtitle: 'meet.ffmuc.net',
    description:
      'Serveur public sans login. Solution la plus simple — zéro infra à gérer. Peut avoir de la latence selon la charge.',
    icon: 'cloud-outline',
    gradient: ['#2563EB', '#06B6D4'],
    badge: 'RAPIDE',
    badgeColor: '#22C55E',
  },
  {
    key: 'webrtc-p2p',
    title: 'WebRTC P2P',
    subtitle: 'Notre TURN/STUN + socket',
    description:
      'Peer-to-peer direct entre les joueurs via notre TURN/STUN maison. Meilleure qualité pour 2-4 joueurs. 100% sur notre infra.',
    icon: 'git-network-outline',
    gradient: ['#7C3AED', '#EC4899'],
    badge: 'MAISON',
    badgeColor: '#EC4899',
  },
  {
    key: 'jitsi-local',
    title: 'Jitsi Local',
    subtitle: 'Docker auto-hébergé',
    description:
      'Serveur Jitsi Meet complet en Docker sur ta machine. Aucun login, contrôle total. Nécessite le conteneur lancé.',
    icon: 'hardware-chip-outline',
    gradient: ['#F59E0B', '#EF4444'],
    badge: 'AUTO-HÉBERGÉ',
    badgeColor: '#F59E0B',
  },
];

export default function SimulateRoomScreen() {
  
  const { t } = useTranslation();
const router = useRouter();
  const { palette } = useTheme();
  const [userCount, setUserCount] = useState(4);
  const [method, setMethod] = useState<Method>('jitsi-public');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      log.bin('POST /rooms/simulate', { gameType: 'kdoub', userCount, method });
      const room = await api.simulateRoom('kdoub', userCount);
      log.bout('201 simulate', { code: room.code, method });
      log.explain(
        `simulation avec ${userCount} joueurs via ${method} → lobby`,
      );
      router.replace(`/room/lobby?code=${room.code}&simulated=1&method=${method}`);
    } catch (e: any) {
      log.error('simulate failed', e?.message);
      Alert.alert(t('error'), e?.message || t('cantSimulate'));
    } finally {
      setCreating(false);
    }
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t("simulationTitle")} showBack />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🎲</Text>
          <Text style={[styles.heroTitle, { color: palette.text }]}>
            Mode Simulation
          </Text>
          <Text style={[styles.heroDesc, { color: palette.textSecondary }]}>
            Créer une room avec {userCount} joueurs simulés + appel audio/vidéo
          </Text>
        </View>

        {/* Nombre de joueurs */}
        <Text style={[styles.label, { color: palette.text }]}>
          Nombre de joueurs
        </Text>
        <View style={styles.countSelector}>
          {[2, 3, 4, 5, 6, 7, 8, 10].map((n) => {
            const active = userCount === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => setUserCount(n)}
                style={[
                  styles.countChip,
                  {
                    backgroundColor: active ? palette.accent : palette.card,
                    borderColor: active ? palette.accent : palette.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countChipText,
                    { color: active ? '#fff' : palette.text },
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Choix de la méthode audio/vidéo */}
        <Text style={[styles.label, { color: palette.text, marginTop: 22 }]}>
          Méthode audio/vidéo
        </Text>
        <View style={styles.methodList}>
          {METHODS.map((m) => {
            const active = method === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMethod(m.key)}
                activeOpacity={0.85}
                style={[
                  styles.methodCard,
                  {
                    borderColor: active ? palette.accent : palette.border,
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                <LinearGradient
                  colors={m.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.methodIconBox}
                >
                  <Ionicons name={m.icon} size={28} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.methodTitle, { color: palette.text }]}>
                      {m.title}
                    </Text>
                    <View style={[styles.methodBadge, { backgroundColor: m.badgeColor }]}>
                      <Text style={styles.methodBadgeText}>{m.badge}</Text>
                    </View>
                  </View>
                  <Text style={[styles.methodSubtitle, { color: palette.accent }]}>
                    {m.subtitle}
                  </Text>
                  <Text
                    style={[styles.methodDesc, { color: palette.textSecondary }]}
                  >
                    {m.description}
                  </Text>
                </View>
                {active && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={palette.accent}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* CTA Lancer */}
        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          style={styles.createBtn}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={palette.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtnGrad}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="videocam" size={22} color="#fff" />
                <Text style={styles.createBtnText}>Lancer</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    body: { padding: 18, paddingBottom: 40 },
    hero: { alignItems: 'center', marginBottom: 20 },
    heroEmoji: { fontSize: 54, marginBottom: 6 },
    heroTitle: { fontSize: 22, fontFamily: 'Inter-Black', letterSpacing: 0.5 },
    heroDesc: {
      fontSize: 12, fontFamily: 'Inter-Regular',
      textAlign: 'center', marginTop: 4, lineHeight: 17,
    },
    label: {
      fontSize: 12, fontFamily: 'Inter-Bold',
      letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
    },
    countSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    countChip: {
      width: 50, height: 50, borderRadius: 14,
      borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    countChipText: { fontSize: 18, fontFamily: 'Inter-Black' },

    methodList: { gap: 10 },
    methodCard: {
      flexDirection: 'row', alignItems: 'center',
      padding: 12, borderRadius: 14,
      backgroundColor: palette.card,
    },
    methodIconBox: {
      width: 52, height: 52, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
    },
    methodTitle: { fontSize: 15, fontFamily: 'Inter-Black' },
    methodBadge: {
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    },
    methodBadgeText: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Black', letterSpacing: 1 },
    methodSubtitle: { fontSize: 11, fontFamily: 'Inter-SemiBold', marginTop: 1 },
    methodDesc: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4, lineHeight: 15 },

    createBtn: { marginTop: 30, borderRadius: 14, overflow: 'hidden' },
    createBtnGrad: {
      paddingVertical: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    createBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 1 },
  });
}
