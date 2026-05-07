/**
 * @file shop.tsx
 * @description Boutique Sally Coins pour Kdoub. Liste des packages depuis
 * `/shop/packages`, achat via RevenueCat (stub — la clé SDK sera fournie via
 * secret EAS), confirmation côté backend qui crédite le portefeuille.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../src/components/AppHeader';
import { useTheme } from '../src/contexts/AppProviders';
import { logger } from '../src/utils/logger';
import * as api from '../shared/api';

const HERO = require('../assets/hero/leaderboard-gold.jpg');
const log = logger.scoped('ShopScreen');

export default function ShopScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<api.ShopPackage[]>([]);
  const [user, setUser] = useState<api.User | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    log.screen('mounted');
    (async () => {
      try {
        log.bin('GET /shop/packages');
        const [pkgs, u] = await Promise.all([api.getShopPackages(), api.getMe()]);
        log.bout('200 /shop/packages', `${pkgs.length} packs`);
        log.explain('packages et utilisateur chargés — rendu de la boutique');
        setPackages(pkgs);
        setUser(u);
      } catch (e) {
        log.error('init shop failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handlePurchase = async (pkg: api.ShopPackage) => {
    log.screen('tap purchase', pkg.productId);
    Alert.alert(
      t('confirmPurchase'),
      `${pkg.name} — ${pkg.coins + (pkg.bonus || 0)} coins pour ${pkg.priceEur}€`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Acheter',
          onPress: async () => {
            setPurchasing(pkg.productId);
            try {
              // RevenueCat SDK call goes here once the key is provided:
              // const purchase = await Purchases.purchasePackage(rcPackage);
              // For now we call the backend directly with a fake purchaseId.
              const fakeId = `dev-${Date.now()}`;
              log.apiIn(`RevenueCat Purchases.purchasePackage(${pkg.productId})`);
              log.apiOut(`SUCCESS purchaseId=${fakeId} (stub mode)`);
              log.bin('POST /shop/purchase/confirm', { productId: pkg.productId });
              const out = await api.confirmPurchase('kdoub', pkg.productId, fakeId, 'android');
              log.bout('200 /shop/purchase/confirm', { amount: out.amount, balance: out.newBalance });
              log.explain(`+${out.amount} coins crédités — nouveau solde ${out.newBalance}`);
              if (user) setUser({ ...user, coins: out.newBalance });
              Alert.alert(
                t('purchaseSuccess'),
                t('purchaseSuccessDesc', { amount: out.amount, balance: out.newBalance }),
              );
            } catch (e: any) {
              log.error('confirmPurchase failed', e?.message);
              Alert.alert(t('error'), e?.message || t('purchaseFailed'));
            } finally {
              setPurchasing(null);
            }
          },
        },
      ],
    );
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('shop') ?? 'Boutique'} showBack />

      <ImageBackground source={HERO} style={styles.hero}>
        <LinearGradient
          colors={['rgba(10,10,26,0.2)', 'rgba(10,10,26,0.95)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.walletBadge}>
          <Ionicons name="wallet" size={20} color="#fff" />
          <Text style={styles.walletValue}>{user?.coins ?? 0}</Text>
          <Text style={styles.walletLabel}>coins</Text>
        </View>
        <Text style={styles.heroTitle}>Sally Coins</Text>
        <Text style={styles.heroSubtitle}>Achète des packs pour débloquer plus de fun</Text>
      </ImageBackground>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {packages.map((pkg) => {
            const total = (pkg.coins || 0) + (pkg.bonus || 0);
            const isBuying = purchasing === pkg.productId;
            return (
              <TouchableOpacity
                key={pkg.productId}
                onPress={() => !isBuying && handlePurchase(pkg)}
                activeOpacity={0.85}
                style={styles.pkgWrap}
              >
                <LinearGradient
                  colors={(pkg.gradient as [string, string]) || palette.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.pkg, { borderColor: pkg.bestValue ? '#fde047' : 'transparent' }]}
                >
                  {pkg.popular && (
                    <View style={styles.ribbon}>
                      <Text style={styles.ribbonText}>POPULAIRE</Text>
                    </View>
                  )}
                  {pkg.bestValue && (
                    <View style={[styles.ribbon, { backgroundColor: '#fde047' }]}>
                      <Text style={[styles.ribbonText, { color: '#78350F' }]}>MEILLEURE OFFRE</Text>
                    </View>
                  )}
                  <Text style={styles.pkgIcon}>{pkg.icon || '💰'}</Text>
                  <Text style={styles.pkgName}>{pkg.name}</Text>
                  <Text style={styles.pkgCoins}>{total.toLocaleString()}</Text>
                  <Text style={styles.pkgCoinsLabel}>coins</Text>
                  {pkg.bonus > 0 && (
                    <View style={styles.bonusPill}>
                      <Text style={styles.bonusText}>+{pkg.bonus} bonus</Text>
                    </View>
                  )}
                  <View style={styles.priceBtn}>
                    {isBuying ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.priceText}>{pkg.priceEur.toFixed(2)} €</Text>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={palette.textSecondary} />
            <Text style={[styles.disclaimerText, { color: palette.textSecondary }]}>
              Les Sally Coins sont une monnaie virtuelle, utilisables uniquement dans l\u2019app.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    hero: {
      height: 140,
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingBottom: 18,
    },
    walletBadge: {
      position: 'absolute',
      top: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.5)',
    },
    walletValue: { color: '#F59E0B', fontSize: 16, fontFamily: 'Inter-Black' },
    walletLabel: { color: '#fff', fontSize: 12, fontFamily: 'Inter-SemiBold' },
    heroTitle: {
      color: '#fff', fontSize: 28, fontFamily: 'Inter-Black', letterSpacing: 1,
      textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 2,
    },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 40 },
    pkgWrap: { width: '48%', marginBottom: 12 },
    pkg: {
      borderRadius: 18, padding: 16, alignItems: 'center',
      borderWidth: 2, overflow: 'hidden',
      minHeight: 210,
    },
    ribbon: {
      position: 'absolute', top: 8, right: -20,
      transform: [{ rotate: '30deg' }],
      backgroundColor: '#EF4444',
      paddingHorizontal: 18, paddingVertical: 2,
    },
    ribbonText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Black', letterSpacing: 1 },
    pkgIcon: { fontSize: 44, marginBottom: 6 },
    pkgName: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Black', letterSpacing: 0.5, marginBottom: 8 },
    pkgCoins: { color: '#fff', fontSize: 28, fontFamily: 'Inter-Black' },
    pkgCoinsLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: 'Inter-SemiBold', marginBottom: 8 },
    bonusPill: {
      backgroundColor: 'rgba(255,255,255,0.25)',
      paddingHorizontal: 10, paddingVertical: 3,
      borderRadius: 999,
      marginBottom: 8,
    },
    bonusText: { color: '#fff', fontSize: 11, fontFamily: 'Inter-Bold' },
    priceBtn: {
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: 18, paddingVertical: 8,
      borderRadius: 999,
      minWidth: 80, alignItems: 'center',
    },
    priceText: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Black' },
    disclaimer: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginTop: 16, paddingHorizontal: 12,
      width: '100%',
    },
    disclaimerText: { fontSize: 11, fontFamily: 'Inter-Regular', flex: 1 },
  });
}
