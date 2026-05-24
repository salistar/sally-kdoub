/**
 * @file welcome.tsx
 * @description Onboarding / welcome screen.
 *  - Language picker SCROLLABLE (handles small / landscape screens).
 *  - Modern Ionicons instead of bare emojis in the slides.
 *  - Per-app hero card image (different card per game).
 *  - Background = the generated per-app splash.png so the look matches
 *    the native splash screen.
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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useLocale, LOCALES, LocaleCode } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';

const { width } = Dimensions.get('window');
const log = logger.scoped('Welcome');

const SPLASH_BG = require('../../assets/splash.png');

// Per-app hero card. Each game shows a different card on the first slide.
const CARDS_PER_APP: Record<string, any> = {
  Ronda:           require('../../assets/cards/12O.png'),
  Kdoub:           require('../../assets/cards/1O.png'),
  Belote:          require('../../assets/cards/12E.png'),
  Tarot:           require('../../assets/cards/12C.png'),
  Scopa:           require('../../assets/cards/7O.png'),
  Okey:            require('../../assets/cards/11B.png'),
  'Qui Est-Ce ?':  require('../../assets/cards/12O.png'),
  Poker:           require('../../assets/cards/1E.png'),
  Concentration:   require('../../assets/cards/10E.png'),
  'Kant Copy':     require('../../assets/cards/3O.png'),
  Solitaire:       require('../../assets/cards/1B.png'),
};

// Per-slide background pattern (built from local card PNGs).
import CardsPattern from '../../src/components/CardsPattern';
import BrandLogo from '../../src/components/BrandLogo';
import { APP_CONFIG } from '../../src/config/app.config';

const SLIDE_BACKGROUNDS = {
  slide2: APP_CONFIG.slides.slide2,
  slide3: APP_CONFIG.slides.slide3,
  slide4: APP_CONFIG.slides.slide4,
};

const APP_COLOR = APP_CONFIG.primary;
const CARD_HERO = CARDS_PER_APP[APP_CONFIG.name] || require('../../assets/cards/12O.png');

// Modern outline icons replacing bare emojis (🌐 🧠 🏆).
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const SLIDE_ICONS: Record<string, IoniconName> = {
  slide2: 'globe-outline',
  slide3: 'bulb-outline',
  slide4: 'trophy-outline',
};

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
    { key: 'slide2', titleKey: 'slide2.title', descKey: 'slide2.desc' },
    { key: 'slide3', titleKey: 'slide3.title', descKey: 'slide3.desc' },
    { key: 'slide4', titleKey: 'slide4.title', descKey: 'slide4.desc' },
  ];

  const handleSelectLanguage = (code: LocaleCode) => {
    log.explain(`utilisateur a choisi '${code}' — sauvegarde + i18n.changeLanguage + broadcast contexte`);
    setLocale(code);
    setLanguageSelected(true);
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      log.screen('next slide', currentIndex + 1);
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      log.screen('finish onboarding -> /auth/login');
      router.replace('/auth/login');
    }
  };

  const handleSkip = () => {
    log.screen('skip intro -> /auth/login');
    router.replace('/auth/login');
  };

  // ─── Language picker step (SCROLLABLE) ───────────────────────
  if (!languageSelected) {
    return (
      <ImageBackground source={SPLASH_BG} style={{ flex: 1 }} resizeMode="cover">
        <LinearGradient
          colors={['rgba(10,10,26,0.78)', 'rgba(10,10,26,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={s.container}>
          <ScrollView
            contentContainerStyle={s.langScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ marginBottom: 16 }}>
              <BrandLogo size={92} />
            </View>
            <Text style={s.sallyHeader}>
              Sally <Text style={{ color: APP_COLOR }}>{APP_CONFIG.name}</Text>
            </Text>
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
          </ScrollView>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
    const bg = (SLIDE_BACKGROUNDS as any)[item.key];
    return (
      <View style={[s.slide, { width }]}>
        {bg && (
          <CardsPattern
            variant={bg.variant}
            tint={bg.tint}
            overlayStrength={0.55}
          />
        )}
        {index === 0 ? (
          <>
            <View
              style={{
                width: width * 0.85, height: 280, alignItems: 'center',
                justifyContent: 'center', borderRadius: 24, overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={['rgba(124,58,237,0.25)', 'rgba(10,10,26,0.85)']}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
              <Animated.Image source={CARD_HERO} style={{ width: 140, height: 210 }} resizeMode="contain" />
            </View>
            <View style={s.titleRow}>
              <Text style={s.sallyText}>Sally</Text>
              <Text style={[s.appNameText, { color: APP_COLOR }]}>{APP_CONFIG.name}</Text>
            </View>
            <Text style={s.slideDesc}>{t('slide1.desc')}</Text>
          </>
        ) : (
          <>
            <View style={s.iconOrbWrap}>
              <View style={[s.iconOrbHalo, { shadowColor: APP_COLOR }]} />
              <LinearGradient
                colors={[APP_COLOR, 'rgba(124,58,237,0.35)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.iconOrbRing}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.04)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.iconOrbInner}
                >
                  <Ionicons
                    name={SLIDE_ICONS[item.key] ?? 'sparkles-outline'}
                    size={70}
                    color="#fff"
                  />
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
        colors={['rgba(10,10,26,0.85)', 'rgba(10,10,26,0.95)', 'rgba(10,10,26,1)']}
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
            <View key={i} style={[s.dot, i === currentIndex ? { backgroundColor: APP_COLOR, width: 28 } : s.dotInactive]} />
          ))}
        </View>

        <View style={s.bottomRow}>
          <TouchableOpacity activeOpacity={0.85} onPress={handleNext}>
            <LinearGradient
              colors={[APP_COLOR, '#C026D3']}
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
  langScroll: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingVertical: 40,
  },
  sallyHeader: {
    fontSize: 32, fontFamily: 'Inter-Black', color: '#fff',
    letterSpacing: 1, marginBottom: 24,
    textShadowColor: 'rgba(124,58,237,0.6)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12,
    textAlign: 'center',
  },
  langTitle: { fontSize: 18, fontFamily: 'Inter-SemiBold', color: '#E9D5FF', marginBottom: 28, textAlign: 'center' },
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
  iconOrbWrap: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  iconOrbHalo: {
    position: 'absolute', width: 168, height: 168, borderRadius: 84,
    backgroundColor: 'rgba(192,132,252,0.18)',
    shadowOffset: { width: 0, height: 0 },
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
  slideTitle: { fontSize: 28, fontFamily: 'Inter-Black', textAlign: 'center', marginBottom: 16 },
  slideDesc: { fontSize: 17, fontFamily: 'Inter-Regular', color: '#D1D5DB', textAlign: 'center', lineHeight: 26 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotInactive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  bottomRow: { paddingHorizontal: 32, paddingBottom: 24 },
  nextButton: { borderRadius: 16, padding: 18, alignItems: 'center' },
  nextButtonText: { color: '#fff', fontSize: 17, fontFamily: 'Inter-Black', letterSpacing: 1 },
});

/* === End of welcome.tsx — SallyCards === */
