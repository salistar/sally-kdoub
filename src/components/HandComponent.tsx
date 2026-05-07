import React from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import { Card } from '../game/kdoubEngine';
import CardComponent from './CardComponent';

interface HandComponentProps {
  cards: Card[];
  selectedIndex: number | null;
  onSelectCard: (index: number) => void;
  disabled?: boolean;
  isCurrentPlayer?: boolean;
  label?: string;
}

export default function HandComponent({
  cards,
  selectedIndex,
  onSelectCard,
  disabled = false,
  isCurrentPlayer = false,
  label,
}: HandComponentProps) {
  if (cards.length === 0) {
    return (
      <View style={styles.emptyHand}>
        <Text style={styles.emptyText}>Main vide!</Text>
      </View>
    );
  }

  // Calculate card overlap based on number of cards
  const cardWidth = 70;
  const maxHandWidth = 340;
  const overlap = cards.length > 4
    ? Math.max(20, (maxHandWidth - cardWidth) / (cards.length - 1))
    : cardWidth + 8;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.hand, isCurrentPlayer && styles.activeHand]}>
          {cards.map((card, index) => (
            <View
              key={card.id}
              style={[
                styles.cardWrapper,
                index > 0 && { marginLeft: overlap < cardWidth ? overlap - cardWidth : 8 },
                { zIndex: selectedIndex === index ? 100 : index },
              ]}
            >
              <CardComponent
                card={card}
                selected={selectedIndex === index}
                onPress={() => onSelectCard(index)}
                disabled={disabled}
                size="medium"
              />
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.countText}>
        {cards.length} carte{cards.length > 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  hand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
  },
  activeHand: {
    paddingBottom: 4,
  },
  cardWrapper: {
    // Individual card positioning
  },
  emptyHand: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  countText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
});
