/**
 * @file (tabs)/index.tsx
 * @description Home Kdoub. 4 actions principales : Créer, Rejoindre, vs Bot
 * (Gemini), Défi du jour. Hero card, daily challenge, coins wallet, stats.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const HERO_IMG = require('../../assets/hero/home-table.jpg');
const log = logger.scoped('HomeScreen');

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<api.User | null>(null);
  const [challenge, setChallenge] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      log.bin('GET /users/me');
      const u = await api.getMe();
      log.bout('200 /users/me', { username: u.username, elo: u.elo, coins: (u as any).coins });
      setUser(u);
      log.bin('GET /challenges/daily/kdoub');
      const ch = await api.getDailyChallenge('kdoub');
      if (ch) {
        log.bout('200 /challenges/daily/kdoub', { title: ch.title, reward: ch.rewardCoins });
        setChallenge(ch);
      }
      log.explain('accueil chargé — stats et défi du jour prêts');
    } catch (e) {
      log.error('load home failed', e);
    }
  }, []);

  useEffect(() => {
    log.screen('mounted');
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleCreate = () => {
    log.screen('nav → /room/create');
    router.push('/room/create');
  };

  const handleJoin = () => {
    log.screen('nav → /room/join');
    router.push('/room/join');
  };

  const handleVsBot = () => {
    log.screen('nav → /game/local?mode=bot (Gemini)');
    router.push('/game/local?mode=bot&botCount=1&difficulty=expert');
  };

  const handleSimulate = () => {
    log.screen('nav → /room/simulate');
    router.push('/room/simulate');
  };

  const handleChallenge = async () => {
    log.bin('POST /challenges/daily/kdoub/matchmake');
    try {
      const room = await api.joinDailyChallenge('kdoub');
      log.bout('200 matchmake', { code: room.code });
      log.explain(`matchmaking défi du jour → room ${room.code}`);
      router.push(`/room/lobby?code=${room.code}`);
    } catch (e: any) {
      log.error('daily matchmake failed', e?.message);
      Alert.alert(t('error'), e?.message || t('matchmakingUnavailable'));
    }
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader
        title="Kdoub"
        subtitle={t('appTagline')}
        rightSlot={
          <TouchableOpacity onPress={() => router.push('/shop')} style={styles.coinsHeader}>
            <Ionicons name="wallet" size={16} color="#F59E0B" />
            <Text style={styles.coinsHeaderText}>{(user as any)?.coins ?? 0}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        {/* Hero photo */}
        <ImageBackground source={HERO_IMG} style={styles.hero} imageStyle={styles.heroImg}>
          <LinearGradient
            colors={['rgba(10,10,26,0.1)', 'rgba(10,10,26,0.85)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroBadge}>
            <Ionicons name="flame" size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>{t('live')}</Text>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>
              {user ? t('heroWelcomeUser', { name: user.username }) : t('heroWelcomeGuest')}
            </Text>
            <Text style={styles.heroSubtitle}>
              {t('elo')} {user?.elo ?? 1000} · {(user as any)?.location?.city || t('defaultCity')}
            </Text>
          </View>
        </ImageBackground>

        {/* Create / Join */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={handleCreate} activeOpacity={0.85}>
            <LinearGradient colors={palette.accentGradient} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
              <Ionicons name="add-circle-outline" size={30} color="#fff" />
              <Text style={styles.actionTitle}>{t('create')}</Text>
              <Text style={styles.actionSub}>{t('createSub')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={handleJoin} activeOpacity={0.85}>
            <LinearGradient colors={['#2563EB', '#06B6D4']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
              <Ionicons name="enter-outline" size={30} color="#fff" />
              <Text style={styles.actionTitle}>{t('join')}</Text>
              <Text style={styles.actionSub}>{t('joinSub')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* vs Bot / Challenge */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCard} onPress={handleVsBot} activeOpacity={0.85}>
            <LinearGradient colors={['#10B981', '#059669']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
              <Ionicons name="hardware-chip-outline" size={30} color="#fff" />
              <Text style={styles.actionTitle}>{t('vsGemini')}</Text>
              <Text style={styles.actionSub}>{t('vsGeminiSub')}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={handleChallenge} activeOpacity={0.85}>
            <LinearGradient colors={['#F59E0B', '#EF4444']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.actionGradient}>
              <Ionicons name="trophy-outline" size={30} color="#fff" />
              <Text style={styles.actionTitle}>{t('dailyChallenge')}</Text>
              <Text style={styles.actionSub}>{t('dailyChallengeReward', { coins: challenge?.rewardCoins ?? 50 })}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Simulation — 2 à 10 joueurs simulés depuis la DB */}
        <TouchableOpacity style={{ borderRadius: 16, overflow: 'hidden', marginTop: 10 }} onPress={handleSimulate} activeOpacity={0.85}>
          <LinearGradient colors={['#EC4899', '#8B5CF6']} start={{x:0,y:0}} end={{x:1,y:1}} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Ionicons name="videocam" size={28} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 0.5 }}>{t('simulation')}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'Inter-SemiBold' }}>
                {t('simulationSub')}
              </Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 }}>{t('new')}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Daily challenge details */}
        {challenge && (
          <LinearGradient colors={palette.cardGradient} style={[styles.card, { borderColor: palette.border }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="star" size={20} color={palette.gold} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>{challenge.title}</Text>
              <View style={styles.badgeNew}>
                <Text style={styles.badgeText}>+{challenge.rewardCoins}</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: palette.textSecondary }]}>
              {challenge.description}
            </Text>
            <TouchableOpacity onPress={handleChallenge} style={styles.challengeBtn}>
              <LinearGradient colors={['#F59E0B', '#FBBF24']} style={styles.challengeGrad}>
                <Text style={styles.challengeText}>{t('startChallenge')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        )}

        {/* Stats */}
        <LinearGradient colors={palette.cardGradient} style={[styles.statsRow, { borderColor: palette.border }]}>
          <Stat value={String((user as any)?.stats?.gamesPlayed ?? 0)} label={t('statGames')} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <Stat value={String((user as any)?.stats?.gamesWon ?? 0)} label={t('statWins')} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <Stat value={`${user?.winRate ?? 0}%`} label={t('statWinRate')} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <Stat value={String((user as any)?.stats?.bestWinStreak ?? 0)} label={t('statBestStreak')} palette={palette} />
        </LinearGradient>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, palette }: { value: string; label: string; palette: ReturnType<typeof useTheme>['palette'] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontFamily: 'Inter-Black', color: palette.text }}>{value}</Text>
      <Text style={{ fontSize: 10, fontFamily: 'Inter-Regular', color: palette.textSecondary, marginTop: 3 }}>
        {label}
      </Text>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    scrollContent: { padding: 14, paddingBottom: 32 },

    coinsHeader: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
    },
    coinsHeaderText: { color: '#F59E0B', fontSize: 13, fontFamily: 'Inter-Black' },

    hero: { height: 150, borderRadius: 18, overflow: 'hidden', justifyContent: 'flex-end' },
    heroImg: { borderRadius: 18 },
    heroBadge: {
      position: 'absolute', top: 12, right: 12,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    },
    heroBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter-Black', letterSpacing: 1 },
    heroBottom: { padding: 16 },
    heroTitle: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Black', letterSpacing: 0.5 },
    heroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'Inter-SemiBold', marginTop: 2 },

    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionCard: { flex: 1, borderRadius: 16, overflow: 'hidden' },
    actionGradient: { alignItems: 'center', paddingVertical: 18, gap: 4 },
    actionTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 0.5, marginTop: 6 },
    actionSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold' },

    card: { borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    cardTitle: { fontSize: 16, fontFamily: 'Inter-Bold', flex: 1 },
    cardDescription: { fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 19, marginBottom: 12 },
    badgeNew: { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
    badgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Black' },
    challengeBtn: { borderRadius: 12, overflow: 'hidden' },
    challengeGrad: { paddingVertical: 12, alignItems: 'center' },
    challengeText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },

    statsRow: {
      flexDirection: 'row', borderRadius: 16, padding: 14,
      alignItems: 'center', borderWidth: 1, marginTop: 12,
    },
    divider: { width: 1, height: 28 },
  });
}
