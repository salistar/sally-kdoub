import React, { useRef, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
  Easing,
} from 'react-native';
import { Card } from '../game/kdoubEngine';
import { getCardImage, getCardBackImage } from '../game/cardAssets';

interface AnimatedCardProps {
  card?: Card;
  faceDown?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: object;
  animateEntry?: boolean;
  entryDelay?: number;
  animateFlip?: boolean;
}

const SIZES = {
  small: { width: 50, height: 72 },
  medium: { width: 70, height: 100 },
  large: { width: 90, height: 130 },
};

export default function AnimatedCard({
  card,
  faceDown = false,
  onPress,
  disabled = false,
  selected = false,
  size = 'medium',
  style,
  animateEntry = false,
  entryDelay = 0,
  animateFlip = false,
}: AnimatedCardProps) {
  const dimensions = SIZES[size];
  const entryAnim = useRef(new Animated.Value(animateEntry ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animateEntry ? 50 : 0)).current;
  const flipAnim = useRef(new Animated.Value(faceDown ? 0 : 1)).current;
  const selectAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Entry animation
  useEffect(() => {
    if (animateEntry) {
      Animated.parallel([
        Animated.timing(entryAnim, {
          toValue: 1,
          duration: 400,
          delay: entryDelay,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          delay: entryDelay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [animateEntry, entryDelay]);

  // Flip animation
  useEffect(() => {
    if (animateFlip) {
      Animated.timing(flipAnim, {
        toValue: faceDown ? 0 : 1,
        duration: 400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [faceDown, animateFlip]);

  // Selection animation
  useEffect(() => {
    Animated.spring(selectAnim, {
      toValue: selected ? 1 : 0,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [selected]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const imageSource = faceDown || !card
    ? getCardBackImage()
    : getCardImage(card.id);

  const translateY = Animated.add(
    slideAnim,
    selectAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -12],
    })
  );

  const cardStyle = {
    opacity: entryAnim,
    transform: [
      { translateY },
      { scale: scaleAnim },
    ],
  };

  const content = (
    <Animated.View
      style={[
        styles.card,
        dimensions,
        cardStyle,
        selected && styles.selectedBorder,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Image
        source={imageSource}
        style={[styles.image, dimensions]}
        resizeMode="contain"
      />
      {selected && <View style={[styles.selectedGlow, dimensions]} />}
    </Animated.View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  image: {
    borderRadius: 8,
  },
  selectedBorder: {
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  selectedGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  disabled: {
    opacity: 0.5,
  },
});
