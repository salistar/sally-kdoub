/**
 * @file (tabs)/leaderboard.tsx
 * @description Leaderboard Kdoub avec 3 portées : Mondial / Pays / Ville.
 * Données réelles depuis /leaderboards/kdoub?scope=<...>, auto-détection
 * de country/city via le profil user (location.country / location.city).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const HERO = require('../../assets/hero/leaderboard-gold.jpg');
const log = logger.scoped('LeaderboardScreen');

type Scope = 'world' | 'country' | 'city';
type Filter = 'season' | 'weekly' | 'allTime';

export default function LeaderboardScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [scope, setScope] = useState<Scope>('world');
  const [filter, setFilter] = useState<Filter>('season');
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    log.screen('params changed', { scope, filter });
    load();
  }, [scope, filter]);

  const load = async () => {
    setLoading(true);
    try {
      log.bin(`GET /leaderboards/kdoub`, { scope, filter });
      const r = await api.getLeaderboardScoped('kdoub', filter, scope, 50);
      log.bout('200 /leaderboards/kdoub', `${r.entries.length} entrées`);
      log.explain(`classement ${scope}/${filter} chargé depuis Mongo`);
      setEntries(r.entries);
    } catch (e) {
      log.error('leaderboard fetch failed', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(palette);

  const medal = (rank: number) => {
    if (rank === 1) return <Ionicons name="medal" size={26} color="#FFD700" />;
    if (rank === 2) return <Ionicons name="medal" size={26} color="#C0C0C0" />;
    if (rank === 3) return <Ionicons name="medal" size={26} color="#CD7F32" />;
    return <Text style={[styles.rankText, { color: palette.textSecondary }]}>{rank}</Text>;
  };

  const scopeTitle =
    scope === 'world' ? t('scopeWorld') :
    scope === 'country' ? t('scopeCountry') : t('scopeCity');

  const renderItem = ({ item }: { item: any }) => (
    <LinearGradient
      colors={palette.cardGradient}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={[styles.row, { borderColor: palette.border }]}
    >
      <View style={styles.rankContainer}>{medal(item.rank)}</View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.username, { color: palette.text }]}>{item.username}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, alignItems: 'center' }}>
          <Text style={[styles.stats, { color: palette.textSecondary }]}>
            {item.gamesWon}{t('winsShort')} / {item.gamesPlayed - item.gamesWon}{t('lossesShort')} · {item.winRate}%
          </Text>
          {item.city && (
            <>
              <Text style={{ color: palette.textSecondary, fontSize: 10 }}>·</Text>
              <Ionicons name="location" size={10} color={palette.textSecondary} />
              <Text style={[styles.stats, { color: palette.textSecondary }]}>{item.city}</Text>
            </>
          )}
          {item.country && scope !== 'country' && (
            <Text style={[styles.countryBadge, { color: palette.textSecondary }]}>
              {countryFlag(item.country)}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.eloContainer}>
        <Text style={[styles.eloValue, { color: palette.gold }]}>{item.elo}</Text>
        <Text style={[styles.eloLabel, { color: palette.textSecondary }]}>ELO</Text>
      </View>
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('leaderboard')} subtitle={t('leaderboardSubtitle', { scope: scopeTitle })} />

      <ImageBackground source={HERO} style={styles.hero}>
        <LinearGradient
          colors={['rgba(10,10,26,0.2)', 'rgba(10,10,26,0.95)']}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.heroTitle}>🏆 {t('topPlayers')} {scopeTitle}</Text>
      </ImageBackground>

      {/* Scope selector */}
      <View style={styles.scopeRow}>
        {(['world', 'country', 'city'] as Scope[]).map((s) => {
          const active = scope === s;
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.scopeTab,
                {
                  backgroundColor: active ? palette.accent : palette.card,
                  borderColor: palette.border,
                },
              ]}
              onPress={() => setScope(s)}
            >
              <Ionicons
                name={s === 'world' ? 'globe' : s === 'country' ? 'flag' : 'location'}
                size={16}
                color={active ? '#fff' : palette.textSecondary}
              />
              <Text style={[styles.scopeText, { color: active ? '#fff' : palette.textSecondary }]}>
                {s === 'world' ? t('scopeWorld') : s === 'country' ? t('scopeCountry') : t('scopeCity')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filter selector */}
      <View style={styles.filterRow}>
        {(['season', 'weekly', 'allTime'] as Filter[]).map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterTab,
                { backgroundColor: active ? palette.accent + '44' : 'transparent', borderColor: active ? palette.accent : palette.border },
              ]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, { color: active ? palette.text : palette.textSecondary }]}>
                {f === 'allTime' ? t('filterAllTime') : f === 'weekly' ? t('filterWeekly') : t('filterSeason')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderItem}
          keyExtractor={(i) => i.userId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: palette.textSecondary, marginTop: 40 }}>
              Aucune donnée pour ce classement
            </Text>
          }
        />
      )}
    </View>
  );
}

function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.bg },
    hero: { height: 90, justifyContent: 'center', alignItems: 'center' },
    heroTitle: {
      color: '#fff', fontSize: 20, fontFamily: 'Inter-Black', letterSpacing: 1,
      textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
    },
    scopeRow: {
      flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 6,
    },
    scopeTab: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, borderRadius: 10, borderWidth: 1, gap: 6,
    },
    scopeText: { fontSize: 12, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
    filterRow: {
      flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 6,
    },
    filterTab: {
      flex: 1, paddingVertical: 6, borderRadius: 999, alignItems: 'center', borderWidth: 1,
    },
    filterText: { fontSize: 11, fontFamily: 'Inter-Bold' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1,
    },
    rankContainer: { width: 36, alignItems: 'center' },
    rankText: { fontSize: 15, fontFamily: 'Inter-Bold' },
    username: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
    stats: { fontSize: 11, fontFamily: 'Inter-Regular' },
    countryBadge: { fontSize: 14, marginLeft: 2 },
    eloContainer: { alignItems: 'center' },
    eloValue: { fontSize: 18, fontFamily: 'Inter-Black' },
    eloLabel: { fontSize: 9, fontFamily: 'Inter-Regular' },
  });
}
