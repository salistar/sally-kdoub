/**
 * @file CardsPattern.tsx
 * @description Background pattern made of locally-bundled Spanish cards.
 * Used by the onboarding slides — no external assets to download.
 *
 * Each variant lays out 6-8 cards in absolute positions with rotations,
 * over a tinted color band. A dark gradient overlay sits on top so the
 * slide text stays legible. The whole thing is purely declarative.
 */
import React from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Pre-bundled Spanish-deck cards (1=As, 12=Roi for each suit O/C/E/B).
const CARDS = {
  '1O':  require('../../assets/cards/1O.png'),
  '12O': require('../../assets/cards/12O.png'),
  '7O':  require('../../assets/cards/7O.png'),
  '11C': require('../../assets/cards/11C.png'),
  '5C':  require('../../assets/cards/5C.png'),
  '12C': require('../../assets/cards/12C.png'),
  '1E':  require('../../assets/cards/1E.png'),
  '7E':  require('../../assets/cards/7E.png'),
  '12E': require('../../assets/cards/12E.png'),
  '11B': require('../../assets/cards/11B.png'),
  '7B':  require('../../assets/cards/7B.png'),
  '3B':  require('../../assets/cards/3B.png'),
};

export type CardsPatternVariant = 'fan' | 'scattered' | 'spread' | 'grid';

interface Layout {
  card: keyof typeof CARDS;
  top: string;     // % of container
  left: string;    // % of container
  rotate: number;  // degrees
  size: number;    // px
  opacity?: number;
}

const LAYOUTS: Record<CardsPatternVariant, Layout[]> = {
  // Fan: cards spread like a hand — top left to right
  fan: [
    { card: '1O',  top: '10%', left: '5%',   rotate: -25, size: 130, opacity: 0.85 },
    { card: '7O',  top: '15%', left: '28%',  rotate: -10, size: 130, opacity: 0.9 },
    { card: '12O', top: '18%', left: '50%',  rotate: 5,   size: 130, opacity: 0.95 },
    { card: '11C', top: '15%', left: '70%',  rotate: 18,  size: 130, opacity: 0.85 },
    { card: '12E', top: '60%', left: '15%',  rotate: 12,  size: 110, opacity: 0.6 },
    { card: '7B',  top: '70%', left: '60%',  rotate: -15, size: 110, opacity: 0.55 },
  ],
  // Scattered: cards thrown across the screen
  scattered: [
    { card: '1E',  top: '8%',  left: '10%',  rotate: -30, size: 120, opacity: 0.85 },
    { card: '5C',  top: '20%', left: '60%',  rotate: 22,  size: 130, opacity: 0.9 },
    { card: '7E',  top: '45%', left: '5%',   rotate: 45,  size: 110, opacity: 0.65 },
    { card: '12C', top: '50%', left: '55%',  rotate: -18, size: 140, opacity: 0.85 },
    { card: '11B', top: '78%', left: '20%',  rotate: 10,  size: 100, opacity: 0.55 },
    { card: '3B',  top: '82%', left: '65%',  rotate: -40, size: 100, opacity: 0.5 },
  ],
  // Spread: cards in a horizontal line at the center, slight overlap
  spread: [
    { card: '1O',  top: '38%', left: '3%',   rotate: -8, size: 110, opacity: 0.85 },
    { card: '7O',  top: '36%', left: '21%',  rotate: -3, size: 115, opacity: 0.9 },
    { card: '11C', top: '35%', left: '40%',  rotate: 0,  size: 120, opacity: 1 },
    { card: '12E', top: '36%', left: '60%',  rotate: 4,  size: 115, opacity: 0.9 },
    { card: '7B',  top: '38%', left: '79%',  rotate: 8,  size: 110, opacity: 0.85 },
    { card: '5C',  top: '12%', left: '40%',  rotate: 18, size: 90,  opacity: 0.45 },
    { card: '3B',  top: '70%', left: '40%',  rotate: -22, size: 90, opacity: 0.4 },
  ],
  // Grid: 2x3 grid in upper portion
  grid: [
    { card: '1O',  top: '8%',  left: '8%',   rotate: -5, size: 105, opacity: 0.7 },
    { card: '12C', top: '8%',  left: '38%',  rotate: 4,  size: 105, opacity: 0.7 },
    { card: '11B', top: '8%',  left: '68%',  rotate: -3, size: 105, opacity: 0.7 },
    { card: '7E',  top: '32%', left: '8%',   rotate: 6,  size: 105, opacity: 0.7 },
    { card: '5C',  top: '32%', left: '38%',  rotate: -7, size: 105, opacity: 0.7 },
    { card: '7O',  top: '32%', left: '68%',  rotate: 2,  size: 105, opacity: 0.7 },
  ],
};

interface CardsPatternProps {
  variant?: CardsPatternVariant;
  /** RGBA color band shown behind the cards. */
  tint?: [string, string, string];
  /** Darken the whole thing — increase if your slide text is light. */
  overlayStrength?: number;
  style?: ViewStyle;
}

export default function CardsPattern({
  variant = 'fan',
  tint = ['rgba(124,58,237,0.6)', 'rgba(30,27,75,0.8)', 'rgba(10,10,26,0.95)'],
  overlayStrength = 0.55,
  style,
}: CardsPatternProps) {
  const layout = LAYOUTS[variant];
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {/* Tinted color background */}
      <LinearGradient colors={tint} style={StyleSheet.absoluteFill} />
      {/* Cards */}
      {layout.map((c, i) => (
        <Image
          key={`${variant}-${i}`}
          source={CARDS[c.card]}
          resizeMode="contain"
          style={{
            position: 'absolute',
            // RN doesn't accept percent strings on non-web for top/left in
            // every version, so we cast — works fine on iOS/Android.
            top: c.top as any,
            left: c.left as any,
            width: c.size,
            height: c.size * 1.55, // ~card aspect ratio (224/144)
            opacity: c.opacity ?? 0.85,
            transform: [{ rotate: `${c.rotate}deg` }],
          }}
        />
      ))}
      {/* Dark overlay so foreground text stays readable */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: `rgba(10,10,26,${overlayStrength})` },
        ]}
      />
    </View>
  );
}
