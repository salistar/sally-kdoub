/**
 * @file (tabs)/profile.tsx
 * @description Profil Kdoub avec vraies valeurs (stats/coins/achievements/
 * recent games) depuis le backend. Synchronisé à chaque focus.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/i18n.config';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const HERO = require('../../assets/hero/profile-chips.jpg');
const log = logger.scoped('ProfileScreen');

function StatCard({ icon, label, value, color, palette }: any) {
  return (
    <LinearGradient colors={palette.cardGradient} style={[statStyles.card, { borderColor: palette.border }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[statStyles.value, { color: palette.text }]}>{value}</Text>
      <Text style={[statStyles.label, { color: palette.textSecondary }]}>{label}</Text>
    </LinearGradient>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  value: { fontSize: 18, fontFamily: 'Inter-Black', marginTop: 4 },
  label: { fontSize: 10, fontFamily: 'Inter-Regular', marginTop: 2 },
});

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = createStyles(palette);
  const [user, setUser] = useState<any>(null);
  const [rank, setRank] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    log.screen('mounted');
    (async () => {
      // 1) /users/me : critique — sans ça on n'a rien à afficher
      try {
        log.bin('GET /users/me');
        const u: any = await api.getMe();
        log.bout('200 /users/me', { username: u.username, elo: u.elo });
        setUser(u);
        setLoadError(null);
      } catch (e: any) {
        const msg = e?.message ?? e?.toString?.() ?? 'unknown';
        const status = /\b(401|403)\b/.test(msg) ? Number(msg.match(/\b(401|403)\b/)![1]) : (e?.status ?? '?');
        log.error('GET /users/me failed', { status, msg });
        // Si 401 ou message Unauthorized, le token a expiré → renvoi vers welcome
        if (status === 401 || /unauthorized/i.test(msg)) {
          router.replace('/auth/welcome');
          return;
        }
        setLoadError(msg);
      }
      // 2) /leaderboards/kdoub/my-rank : optionnel — l'absence ne bloque pas
      // l'écran (l'utilisateur peut être nouveau ou ne jamais avoir joué).
      try {
        log.bin('GET /leaderboards/kdoub/my-rank');
        const r = await api.getMyRank('kdoub', 'season');
        log.bout('200 my-rank', r);
        setRank(r);
        log.explain('profil + rang chargés — vraies valeurs du backend');
      } catch (e: any) {
        const msg = e?.message ?? e?.toString?.() ?? 'unknown';
        const status = e?.status ?? e?.response?.status ?? '?';
        // 404 = utilisateur sans classement, OK
        if (status === 404) {
          log.explain('pas encore de rang Kdoub pour ce joueur — affichage sans badge');
        } else {
          log.error('GET /my-rank failed (non bloquant)', { status, msg });
        }
      }
    })();
  }, [router]);

  if (!user) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
        <AppHeader title={t('profile')} />
        {loadError ? (
          <View style={{ padding: 24, alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="cloud-offline-outline" size={42} color={palette.textSecondary} />
            <Text style={{ textAlign: 'center', color: palette.text, marginTop: 12, fontFamily: 'Inter-Bold' }}>
              {t('error')}
            </Text>
            <Text style={{ textAlign: 'center', color: palette.textSecondary, marginTop: 6 }}>
              {loadError}
            </Text>
          </View>
        ) : (
          <Text style={{ textAlign: 'center', color: palette.textSecondary, marginTop: 30 }}>
            {t('loading')}
          </Text>
        )}
      </View>
    );
  }

  const stats = user.stats || {};
  const location = user.location || {};
  const achievements = user.achievements || [];
  const recent = user.recentGames || [];

  return (
    <View style={styles.container}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('profile') ?? 'Profil'} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero + avatar */}
        <ImageBackground source={HERO} style={styles.hero} imageStyle={styles.heroImg}>
          <LinearGradient
            colors={['rgba(124,58,237,0.25)', 'rgba(10,10,26,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.avatarWrap}>
            <LinearGradient colors={palette.accentGradient} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Ionicons name="person" size={48} color="#fff" />
              </View>
            </LinearGradient>
          </View>
          <Text style={styles.heroUsername}>{user.username}</Text>
          {location.city && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color="rgba(255,255,255,0.75)" />
              <Text style={styles.locationText}>
                {location.city}, {location.countryName || location.country}
              </Text>
            </View>
          )}
          {rank?.rank && (
            <View style={styles.rankBadge}>
              <Ionicons name="trophy" size={14} color="#F59E0B" />
              <Text style={styles.rankBadgeText}>Rang #{rank.rank} · top {100 - rank.percentile}%</Text>
            </View>
          )}
          <TouchableOpacity style={styles.editButton} onPress={() => router.push('/settings')}>
            <Ionicons name="pencil" size={12} color="#fff" />
            <Text style={styles.editButtonText}>{t('edit')}</Text>
          </TouchableOpacity>
        </ImageBackground>

        {/* Coins + Diamonds */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14, marginTop: 10 }}>
          <LinearGradient colors={['#F59E0B', '#D97706']} style={[styles.walletCard, { flex: 1 }]}>
            <Ionicons name="wallet" size={22} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.walletValue}>{user.coins ?? 0}</Text>
              <Text style={styles.walletLabel}>{t('walletCoins')}</Text>
            </View>
            <TouchableOpacity style={styles.shopBtn} onPress={() => router.push('/shop')}>
              <Text style={styles.shopBtnText}>+</Text>
            </TouchableOpacity>
          </LinearGradient>
          <LinearGradient colors={['#06B6D4', '#0891B2']} style={[styles.walletCard, { flex: 1 }]}>
            <Ionicons name="diamond" size={22} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.walletValue}>{user.diamonds ?? 0}</Text>
              <Text style={styles.walletLabel}>{t('walletDiamonds')}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Stats grid 3x2 */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatCard icon="game-controller" label={t('statGames')} value={stats.gamesPlayed || 0} color="#3B82F6" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="trophy" label={t('statWins')} value={stats.gamesWon || 0} color="#F59E0B" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="trending-up" label={t('elo')} value={stats.elo || 1000} color="#10B981" palette={palette} />
          </View>
          <View style={[styles.statsRow, { marginTop: 8 }]}>
            <StatCard icon="flame" label={t('statStreak')} value={stats.winStreak || 0} color="#EF4444" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="medal" label={t('statBest')} value={stats.bestWinStreak || 0} color="#A855F7" palette={palette} />
            <View style={{ width: 8 }} />
            <StatCard icon="analytics" label={t('winRate')} value={`${user.winRate || 0}%`} color="#14B8A6" palette={palette} />
          </View>
        </View>

        {/* Achievements */}
        {achievements.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              🏅 {t('achievements')} ({achievements.length})
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 14 }}>
              {achievements.map((a: any) => (
                <LinearGradient
                  key={a.id}
                  colors={palette.accentGradient}
                  style={styles.achievementPill}
                >
                  <Ionicons name="star" size={14} color="#fff" />
                  <Text style={styles.achievementText}>{a.name}</Text>
                </LinearGradient>
              ))}
            </ScrollView>
          </>
        )}

        {/* Recent games */}
        <Text style={[styles.sectionTitle, { color: palette.text }]}>📜 {t('recentGames')}</Text>
        {recent.length === 0 ? (
          <LinearGradient colors={palette.cardGradient} style={[styles.emptyState, { borderColor: palette.border }]}>
            <Ionicons name="game-controller-outline" size={42} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              {t('noRecentGames')}
            </Text>
          </LinearGradient>
        ) : (
          recent.map((g: any, i: number) => (
            <LinearGradient
              key={i}
              colors={palette.cardGradient}
              style={[styles.gameRow, { borderColor: palette.border }]}
            >
              <Ionicons
                name={g.result === 'win' ? 'checkmark-circle' : 'close-circle'}
                size={28}
                color={g.result === 'win' ? palette.success : palette.danger}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.gameOpponent, { color: palette.text }]}>
                  {t('vsOpponent', { name: g.opponent })}
                </Text>
                <Text style={[styles.gameMeta, { color: palette.textSecondary }]}>
                  {new Date(g.playedAt).toLocaleDateString(i18n.language === 'ar' || i18n.language === 'darija' ? 'ar-MA' : i18n.language)} · {Math.round((g.durationMs || 0) / 60000)} {t('minShort')}
                </Text>
              </View>
              <Text style={[styles.gameElo, { color: g.eloChange > 0 ? palette.success : palette.danger }]}>
                {g.eloChange > 0 ? '+' : ''}{g.eloChange} ELO
              </Text>
            </LinearGradient>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.bg },
    scrollContent: { padding: 0, paddingBottom: 40 },

    hero: { height: 260, alignItems: 'center', justifyContent: 'center', paddingTop: 16 },
    heroImg: { opacity: 0.95 },
    avatarWrap: { marginBottom: 8 },
    avatarRing: {
      width: 92, height: 92, borderRadius: 46,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarInner: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: '#1E1B3A', alignItems: 'center', justifyContent: 'center',
    },
    heroUsername: { fontSize: 22, fontFamily: 'Inter-Black', color: '#fff', letterSpacing: 0.5 },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    locationText: { fontSize: 11, fontFamily: 'Inter-Regular', color: 'rgba(255,255,255,0.75)' },
    rankBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(245,158,11,0.2)',
      borderWidth: 1, borderColor: 'rgba(245,158,11,0.6)',
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 999, marginTop: 6,
    },
    rankBadgeText: { color: '#F59E0B', fontSize: 11, fontFamily: 'Inter-Bold' },
    editButton: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#7C3AED',
      paddingHorizontal: 14, paddingVertical: 6,
      borderRadius: 999, marginTop: 8,
    },
    editButtonText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Bold' },

    walletCard: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 14, padding: 14,
    },
    walletValue: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Black' },
    walletLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontFamily: 'Inter-SemiBold' },
    shopBtn: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center',
    },
    shopBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 22 },

    statsGrid: { padding: 14 },
    statsRow: { flexDirection: 'row' },

    sectionTitle: { fontSize: 14, fontFamily: 'Inter-Bold', marginHorizontal: 14, marginTop: 10, marginBottom: 8 },
    achievementPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 999, marginRight: 8,
    },
    achievementText: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },

    emptyState: {
      alignItems: 'center', paddingVertical: 24,
      marginHorizontal: 14, borderRadius: 12, borderWidth: 1, gap: 6,
    },
    emptyText: { fontSize: 13, fontFamily: 'Inter-SemiBold' },

    gameRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 14, marginBottom: 6,
      padding: 12, borderRadius: 12, borderWidth: 1,
    },
    gameOpponent: { fontSize: 14, fontFamily: 'Inter-SemiBold' },
    gameMeta: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
    gameElo: { fontSize: 13, fontFamily: 'Inter-Black' },
  });
}
