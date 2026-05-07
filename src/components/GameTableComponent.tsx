import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { PlayedCard, Player, formatDeclaredValue, ChallengeResult } from '../game/kdoubEngine';
import CardComponent from './CardComponent';

interface GameTableComponentProps {
  pile: PlayedCard[];
  lastPlay: PlayedCard | null;
  lastChallenge: ChallengeResult | null;
  players: Player[];
  currentPlayerId: string;
  showReveal?: boolean;
}

export default function GameTableComponent({
  pile,
  lastPlay,
  lastChallenge,
  players,
  currentPlayerId,
  showReveal = false,
}: GameTableComponentProps) {
  const getPlayerName = (id: string) =>
    players.find((p) => p.id === id)?.name || id;

  return (
    <View style={styles.container}>
      {/* Pile de cartes */}
      <View style={styles.pileArea}>
        <Text style={styles.pileLabel}>
          Tas ({pile.length} carte{pile.length !== 1 ? 's' : ''})
        </Text>

        <View style={styles.pileStack}>
          {pile.length === 0 ? (
            <View style={styles.emptyPile}>
              <Text style={styles.emptyPileText}>Vide</Text>
            </View>
          ) : (
            <>
              {/* Montrer les dernières cartes empilées face cachée */}
              {pile.slice(-3).map((played, i) => {
                const isLast = i === Math.min(pile.length, 3) - 1;
                const shouldReveal = isLast && showReveal && lastChallenge;

                return (
                  <View
                    key={i}
                    style={[
                      styles.stackedCard,
                      { transform: [{ rotate: `${(i - 1) * 5}deg` }] },
                    ]}
                  >
                    <CardComponent
                      card={played.card}
                      faceDown={!shouldReveal}
                      size="medium"
                    />
                  </View>
                );
              })}
            </>
          )}
        </View>
      </View>

      {/* Dernière déclaration */}
      {lastPlay && !showReveal && (
        <View style={styles.declarationBanner}>
          <Text style={styles.declarationText}>
            <Text style={styles.playerNameText}>
              {getPlayerName(lastPlay.playerId)}
            </Text>
            {' a joué un '}
            <Text style={styles.valueText}>
              {formatDeclaredValue(lastPlay.declaredValue)}
            </Text>
          </Text>
        </View>
      )}

      {/* Résultat de la contestation */}
      {showReveal && lastChallenge && (
        <View style={[
          styles.revealBanner,
          lastChallenge.wasBluff ? styles.bluffBanner : styles.truthBanner,
        ]}>
          <Text style={styles.revealTitle}>
            {lastChallenge.wasBluff ? '🎭 BLUFF!' : '✅ VÉRITÉ!'}
          </Text>
          <Text style={styles.revealText}>
            {lastChallenge.wasBluff
              ? `${getPlayerName(lastChallenge.challengedPlayerId)} mentait! Il ramasse ${lastChallenge.cardsCollected.length} cartes.`
              : `${getPlayerName(lastChallenge.challengerId)} s'est trompé! Il ramasse ${lastChallenge.cardsCollected.length} cartes.`
            }
          </Text>
        </View>
      )}

      {/* Infos joueurs autour de la table */}
      <View style={styles.playersRing}>
        {players.map((player) => {
          const isActive = player.id === currentPlayerId;
          return (
            <View
              key={player.id}
              style={[
                styles.playerBadge,
                isActive && styles.activePlayerBadge,
              ]}
            >
              <Text style={[
                styles.playerBadgeName,
                isActive && styles.activePlayerName,
              ]}>
                {player.isBot ? '🤖 ' : ''}{player.name}
              </Text>
              <View style={styles.cardCountBadge}>
                <Text style={styles.cardCountText}>{player.hand.length}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  pileArea: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pileLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pileStack: {
    width: 100,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stackedCard: {
    position: 'absolute',
  },
  emptyPile: {
    width: 70,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPileText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  declarationBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  declarationText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  playerNameText: {
    fontFamily: 'Inter-Bold',
    color: '#22c55e',
  },
  valueText: {
    fontFamily: 'Inter-Bold',
    color: '#fbbf24',
  },
  revealBanner: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  bluffBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  truthBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  revealTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Black',
    color: '#fff',
    marginBottom: 4,
  },
  revealText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  playersRing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  playerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  activePlayerBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  playerBadgeName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  activePlayerName: {
    color: '#22c55e',
  },
  cardCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardCountText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
});
