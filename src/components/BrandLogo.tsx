/**
 * @file BrandLogo.tsx
 * @description Logo officiel — PILOTÉ PAR LE THÈME (APP_CONFIG).
 * Carte de jeu inclinée + glyphe dérivé du nom de l'app → chaque jeu
 * SallyCards a un logo visuellement DIFFÉRENT automatiquement
 * (couleurs primary/secondary propres + suit/forme propre).
 * 100% Views + expo-linear-gradient (aucune dépendance SVG).
 * Fichier identique pour toutes les apps (copie verbatim).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { APP_CONFIG } from '../config/app.config';

const PRIMARY = (APP_CONFIG as any).primary || '#C084FC';
const SECONDARY = (APP_CONFIG as any).secondary || '#7C3AED';
const NAME = (APP_CONFIG as any).name || 'Sally';

// glyphe + rotation dérivés du nom → identité unique par app
const GLYPHS = ['♠', '♥', '♦', '♣', '★', '◆', '✦', '♛', '♞', '⬢', '⬟', '✿'];
function hashName(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const H = hashName(NAME);
const GLYPH = GLYPHS[H % GLYPHS.length];
const GLYPH2 = GLYPHS[(H >> 3) % GLYPHS.length];
const TILT = 6 + (H % 9); // 6..14 deg

export default function BrandLogo({ size = 96 }: { size?: number }) {
  const cardW = size;
  const cardH = size * 1.36;
  const radius = size * 0.16;

  return (
    <View
      style={{
        width: size * 1.5,
        height: size * 1.6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={[
          styles.halo,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: size * 0.7,
            backgroundColor: PRIMARY + '38',
            shadowColor: PRIMARY,
            shadowRadius: size * 0.3,
          },
        ]}
      />

      {/* carte arrière */}
      <LinearGradient
        colors={[SECONDARY, PRIMARY]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            width: cardW * 0.9,
            height: cardH * 0.9,
            borderRadius: radius,
            transform: [{ rotate: `-${TILT}deg` }],
            opacity: 0.7,
          },
        ]}
      >
        <Text style={{ fontSize: size * 0.34, color: 'rgba(255,255,255,0.55)' }}>
          {GLYPH2}
        </Text>
      </LinearGradient>

      {/* carte avant */}
      <LinearGradient
        colors={[PRIMARY, SECONDARY]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.card,
          {
            width: cardW,
            height: cardH,
            borderRadius: radius,
            transform: [{ rotate: `${TILT}deg` }],
            borderWidth: size * 0.03,
            borderColor: '#FCD34D',
          },
        ]}
      >
        <Text
          style={[
            styles.corner,
            { top: size * 0.06, left: size * 0.08, fontSize: size * 0.16 },
          ]}
        >
          {GLYPH}
        </Text>
        <Text
          style={[
            styles.corner,
            {
              bottom: size * 0.06,
              right: size * 0.08,
              fontSize: size * 0.16,
              transform: [{ rotate: '180deg' }],
            },
          ]}
        >
          {GLYPH}
        </Text>
        <Text
          style={{
            fontSize: size * 0.6,
            color: '#0A1929',
            textShadowColor: '#FCD34D',
            textShadowRadius: 8,
          }}
        >
          {GLYPH}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
  },
  card: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  corner: {
    position: 'absolute',
    color: '#FCD34D',
    fontWeight: '900',
  },
});

/* === End of BrandLogo.tsx — theme-driven (SallyCards) === */
