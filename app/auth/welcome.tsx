/**
 * @file welcome.tsx
 * @description Onboarding / welcome screen. Language picker first (uses
 * shared LocaleContext — persists to AsyncStorage so user never sees this
 * twice). Then 4-slide swipeable carousel with hero images, gradient
 * backgrounds, and animated CTA.
 */

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
  ImageBackground,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useLocale, LOCALES, LocaleCode } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';

const { width } = Dimensions.get('window');
const log = logger.scoped('Welcome');

const HERO       = require('../../assets/hero/welcome-deck.jpg');
const SPLASH_BG  = require('../../assets/hero/splash-cards.jpg');
const CARD_HERO  = require('../../assets/cards/12O.png');

// Per-slide background pattern (built from local card PNGs).
import CardsPattern, { CardsPatternVariant } from '../../src/components/CardsPattern';
import BrandLogo from '../../src/components/BrandLogo';
import { APP_CONFIG } from '../../src/config/app.config';

const SLIDE_BACKGROUNDS = {
  slide2: APP_CONFIG.slides.slide2,
  slide3: APP_CONFIG.slides.slide3,
  slide4: APP_CONFIG.slides.slide4,
};

const APP_COLOR = APP_CONFIG.primary;

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  const [languageSelected, setLanguageSelected] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    log.screen('mounted');
  }, []);

  const SLIDES = [
    { key: 'logo',   useCard: true },
    { key: 'slide2', icon: '🌐', titleKey: 'slide2.title', descKey: 'slide2.desc' },
    { key: 'slide3', icon: '🧠', titleKey: 'slide3.title', descKey: 'slide3.desc' },
    { key: 'slide4', icon: '🏆', titleKey: 'slide4.title', descKey: 'slide4.desc' },
  ];

  const handleSelectLanguage = (code: LocaleCode) => {
    log.explain(`utilisateur a choisi '${code}' — sauvegardé + i18n.changeLanguage + broadcast contexte`);
    setLocale(code);
    setLanguageSelected(true);
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      log.screen('next slide', currentIndex + 1);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      log.screen('finish onboarding → /auth/login');
      router.replace('/auth/login');
    }
  };

  const handleSkip = () => {
    log.screen('skip intro → /auth/login');
    router.replace('/auth/login');
  };

  // ─── Language picker step ───────────────────────
  if (!languageSelected) {
    return (
      <ImageBackground source={SPLASH_BG} style={{ flex: 1 }} resizeMode="cover">
        <LinearGradient
          colors={['rgba(10,10,26,0.88)', 'rgba(30,27,75,0.95)', 'rgba(59,7,100,0.95)']}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={s.container}>
          <View style={s.langContainer}>
            <View style={{ marginBottom: 14 }}>
              <BrandLogo size={92} />
            </View>
            <Text style={s.sallyHeader}>Sally <Text style={{ color: APP_COLOR }}>{APP_CONFIG.name}</Text></Text>
            <Text style={s.langTitle}>{t('chooseLanguage') ?? 'Choose your language'}</Text>
            <View style={s.langButtons}>
              {LOCALES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[s.langButton, locale === lang.code && s.langButtonActive]}
                  onPress={() => handleSelectLanguage(lang.code)}
                  activeOpacity={0.8}
                >
                  <Text style={s.langFlag}>{lang.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.langLabel}>{lang.native}</Text>
                    <Text style={s.langLabelEn}>{lang.label}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
    const bg = (SLIDE_BACKGROUNDS as any)[item.key];
    return (
      <View style={[s.slide, { width }]}>
        {/* Per-slide cards-pattern background (slides 2..4) */}
        {bg && (
          <CardsPattern
            variant={bg.variant}
            tint={bg.tint}
            overlayStrength={0.55}
          />
        )}
        {index === 0 ? (
          <>
            <ImageBackground
              source={HERO}
              style={{ width: width * 0.85, height: 280, alignItems: 'center', justifyContent: 'center' }}
              imageStyle={{ borderRadius: 24 }}
            >
              <LinearGradient
                colors={['rgba(124,58,237,0.2)', 'rgba(10,10,26,0.75)']}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
              <Animated.Image source={CARD_HERO} style={{ width: 120, height: 180 }} resizeMode="contain" />
            </ImageBackground>
            <View style={s.titleRow}>
              <Text style={s.sallyText}>Sally</Text>
              <Text style={[s.appNameText, { color: APP_COLOR }]}>{APP_CONFIG.name}</Text>
            </View>
            <Text style={s.slideDesc}>{t('slide1.desc')}</Text>
          </>
        ) : (
          <>
            {/* Orbe design pour l'icône (au lieu d'un emoji nu) */}
            <View style={s.iconOrbWrap}>
              <View style={s.iconOrbHalo} />
              <LinearGradient
                colors={['#C084FC', 'rgba(124,58,237,0.35)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.iconOrbRing}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.iconOrbInner}
                >
                  <Text style={s.iconOrbEmoji}>{item.icon}</Text>
                </LinearGradient>
              </LinearGradient>
            </View>
            <Text style={[s.slideTitle, { color: APP_COLOR }]}>{t(item.titleKey!)}</Text>
            <Text style={s.slideDesc}>{t(item.descKey!)}</Text>
          </>
        )}
      </View>
    );
  };

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <ImageBackground source={SPLASH_BG} style={{ flex: 1 }} resizeMode="cover">
      <LinearGradient
        colors={['rgba(10,10,26,0.92)', 'rgba(30,27,75,0.96)', 'rgba(10,10,26,1)']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={s.container}>
        <View style={s.skipRow}>
          <TouchableOpacity onPress={handleSkip}>
            <Text style={s.skipText}>{t('skipIntro') ?? 'Skip'}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            log.screen('slide change', index);
            setCurrentIndex(index);
          }}
        />

        <View style={s.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[s.dot, i === currentIndex ? s.dotActive : s.dotInactive]} />
          ))}
        </View>

        <View style={s.bottomRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={handleNext}>
            <LinearGradient
              colors={['#7C3AED', '#C026D3']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.nextButton}
            >
              <Text style={s.nextButtonText}>
                {isLast ? (t('getStarted') ?? 'Get Started') : (t('next') ?? 'Next')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  langContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  langHero: { fontSize: 70, marginBottom: 10 },
  sallyHeader: {
    fontSize: 32, fontFamily: 'Inter-Black', color: '#fff',
    letterSpacing: 1, marginBottom: 24,
    textShadowColor: 'rgba(124,58,237,0.6)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12,
  },
  langTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold', color: '#E9D5FF', marginBottom: 28 },
  langButtons: { gap: 10, width: '100%' },
  langButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(124,58,237,0.15)',
    borderRadius: 14, padding: 16, gap: 14,
    borderWidth: 1, borderColor: 'rgba(192,132,252,0.3)',
  },
  langButtonActive: { backgroundColor: 'rgba(124,58,237,0.4)', borderColor: APP_COLOR },
  langFlag: { fontSize: 30 },
  langLabel: { fontSize: 18, fontFamily: 'Inter-Bold', color: '#fff' },
  langLabelEn: { fontSize: 12, fontFamily: 'Inter-Regular', color: '#C4B5FD', marginTop: 2 },

  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 8 },
  skipText: { color: '#9CA3AF', fontSize: 14, fontFamily: 'Inter-Bold' },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, marginBottom: 14 },
  sallyText: { fontSize: 38, fontFamily: 'Inter-Black', color: '#fff' },
  appNameText: { fontSize: 38, fontFamily: 'Inter-Black' },
  slideIcon: { fontSize: 84, marginBottom: 24 },
  iconOrbWrap: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  iconOrbHalo: {
    position: 'absolute', width: 168, height: 168, borderRadius: 84,
    backgroundColor: 'rgba(192,132,252,0.18)',
    shadowColor: '#C026D3', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 28, elevation: 14,
  },
  iconOrbRing: {
    width: 148, height: 148, borderRadius: 74,
    alignItems: 'center', justifyContent: 'center', padding: 6,
  },
  iconOrbInner: {
    flex: 1, width: '100%', borderRadius: 68,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  iconOrbEmoji: { fontSize: 66 },
  slideTitle: { fontSize: 28, fontFamily: 'Inter-Black', textAlign: 'center', marginBottom: 16 },
  slideDesc: { fontSize: 17, fontFamily: 'Inter-Regular', color: '#D1D5DB', textAlign: 'center', lineHeight: 26 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: APP_COLOR, width: 28 },
  dotInactive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  bottomRow: { paddingHorizontal: 32, paddingBottom: 24 },
  nextButton: { borderRadius: 16, padding: 18, alignItems: 'center' },
  nextButtonText: { color: '#fff', fontSize: 17, fontFamily: 'Inter-Black', letterSpacing: 1 },
});

/* === End of welcome.tsx — Kdoub === */
