import React from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { Card } from '../game/kdoubEngine';
import { getCardImage, getCardBackImage } from '../game/cardAssets';

interface CardComponentProps {
  card?: Card;
  faceDown?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  selected?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: object;
}

const SIZES = {
  small: { width: 50, height: 72 },
  medium: { width: 70, height: 100 },
  large: { width: 90, height: 130 },
};

export default function CardComponent({
  card,
  faceDown = false,
  onPress,
  disabled = false,
  selected = false,
  size = 'medium',
  style,
}: CardComponentProps) {
  const dimensions = SIZES[size];
  const imageSource = faceDown || !card
    ? getCardBackImage()
    : getCardImage(card.id);

  const content = (
    <View
      style={[
        styles.card,
        dimensions,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Image
        source={imageSource}
        style={[styles.image, dimensions]}
        resizeMode="contain"
      />
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
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
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  image: {
    borderRadius: 8,
  },
  selected: {
    borderWidth: 2,
    borderColor: '#22c55e',
    transform: [{ translateY: -10 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
