/**
 * @file AnimatedSplash.tsx
 * @description Custom animated splash shown on top of the native splash.
 * Plays for ~2.2s while assets/fonts/prefs hydrate. Defensively loads
 * every image through try/catch — missing assets are silently skipped so
 * the splash NEVER crashes the app.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { logger } from '../utils/logger';
import { APP_CONFIG } from '../config/app.config';

const { width, height } = Dimensions.get('window');
const log = logger.scoped('AnimatedSplash');

let CARD_LEFT: any, CARD_CENTER: any, CARD_RIGHT: any, HERO: any;
try { CARD_LEFT   = require('../../assets/cards/1O.png'); } catch {}
try { CARD_CENTER = require('../../assets/cards/12O.png'); } catch {}
try { CARD_RIGHT  = require('../../assets/cards/11E.png'); } catch {}
try { HERO        = require('../../assets/hero/splash-cards.jpg'); } catch {}

interface Props {
  visible: boolean;
  onFinish?: () => void;
}

export default function AnimatedSplash({ visible, onFinish }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const leftRot = useRef(new Animated.Value(0)).current;
  const rightRot = useRef(new Animated.Value(0)).current;
  const centerY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    log.screen('mounted — playing intro animation');
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }),
      Animated.timing(leftRot,   { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(rightRot,  { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(centerY,   { toValue: 0, duration: 700, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!visible) {
      log.explain('app hydratée → fondu de sortie du splash');
      Animated.timing(opacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => onFinish?.());
    }
  }, [visible]);

  const leftRotInterp  = leftRot.interpolate({  inputRange: [0, 1], outputRange: ['0deg', '-18deg'] });
  const rightRotInterp = rightRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg',  '18deg'] });

  const inner = (
    <>
      <LinearGradient
        colors={['rgba(10,10,26,0.92)', 'rgba(26,11,46,0.96)', 'rgba(30,27,75,1)']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.fan}>
        {CARD_LEFT && (
          <Animated.Image
            source={CARD_LEFT}
            style={[styles.card, styles.cardSide, { transform: [{ rotate: leftRotInterp }, { translateX: -36 }] }]}
            resizeMode="contain"
          />
        )}
        {CARD_CENTER && (
          <Animated.Image
            source={CARD_CENTER}
            style={[styles.card, styles.cardCenter, { transform: [{ translateY: centerY }] }]}
            resizeMode="contain"
          />
        )}
        {CARD_RIGHT && (
          <Animated.Image
            source={CARD_RIGHT}
            style={[styles.card, styles.cardSide, { transform: [{ rotate: rightRotInterp }, { translateX: 36 }] }]}
            resizeMode="contain"
          />
        )}
      </View>

      <Animated.View
        style={[styles.logoBox, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
      >
        <Text style={[styles.sally, { textShadowColor: APP_CONFIG.splash.sallyGlow }]}>Sally</Text>
        <Text style={[styles.kdoub, { color: APP_CONFIG.primary, textShadowColor: APP_CONFIG.splash.glow }]}>{APP_CONFIG.name}</Text>{/* theme-override */}
        <View style={[styles.pill, { borderColor: APP_CONFIG.splash.pillBorder, backgroundColor: APP_CONFIG.splash.pillBg }]}>
          <Text style={[styles.tagline, { color: APP_CONFIG.splash.pillText }]}>{APP_CONFIG.splash.suit}  Sally · {APP_CONFIG.name}  {APP_CONFIG.splash.suit2}</Text>
        </View>
      </Animated.View>
    </>
  );

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { opacity, zIndex: 9999, backgroundColor: '#0A0A1A' }]}
    >
      {HERO ? (
        <ImageBackground source={HERO} style={styles.bg} resizeMode="cover" blurRadius={6}>
          {inner}
        </ImageBackground>
      ) : (
        <View style={styles.bg}>{inner}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width, height, alignItems: 'center', justifyContent: 'center' },
  fan: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 40,
    height: 200,
  },
  card: {
    width: 110, height: 170,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  cardSide: { position: 'absolute' },
  cardCenter: { zIndex: 2 },
  logoBox: { alignItems: 'center' },
  sally: {
    color: '#fff',
    fontSize: 36,
    fontFamily: 'Inter-Black',
    letterSpacing: 2,
    textShadowColor: 'rgba(124,58,237,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  kdoub: {
    color: '#C084FC',
    fontSize: 64,
    fontFamily: 'Inter-Black',
    letterSpacing: 4,
    marginTop: -6,
    textShadowColor: 'rgba(192,38,211,0.6)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 20,
  },
  pill: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.5)',
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  tagline: {
    color: '#E9D5FF',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.5,
  },
});
