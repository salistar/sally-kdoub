import React, { useReducer, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  GameState,
  CardValue,
  gameReducer,
  createInitialState,
  getCurrentPlayer,
  isPlayerTurn,
} from '../game/kdoubEngine';
import HandComponent from '../components/HandComponent';
import GameTableComponent from '../components/GameTableComponent';
import ValueSelector from '../components/ValueSelector';

const PLAYER_1_ID = 'player-1';
const PLAYER_2_ID = 'player-2';
const PLAYER_1_NAME = 'Joueur 1';
const PLAYER_2_NAME = 'Joueur 2';

type TurnPhase = 'pass_device' | 'playing';

export default function LocalTwoPlayerScreen() {
  const router = useRouter();
  const [state, dispatch] = useReducer(gameReducer, createInitialState());
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('pass_device');
  const [gameStarted, setGameStarted] = useState(false);

  // Initialize game
  const startGame = useCallback(() => {
    dispatch({ type: 'JOIN', playerId: PLAYER_1_ID, playerName: PLAYER_1_NAME });
    dispatch({ type: 'JOIN', playerId: PLAYER_2_ID, playerName: PLAYER_2_NAME });
    dispatch({ type: 'START_GAME' });
    setGameStarted(true);
    setTurnPhase('pass_device');
  }, []);

  // Start on mount
  React.useEffect(() => {
    if (!gameStarted) startGame();
  }, []);

  const currentPlayer = getCurrentPlayer(state);
  const currentPlayerId = currentPlayer?.id || '';
  const currentPlayerName = currentPlayer?.name || '';
  const currentHand = currentPlayer?.hand || [];

  const handleReadyToPlay = () => {
    setTurnPhase('playing');
  };

  const handleSelectCard = useCallback((index: number) => {
    if (turnPhase !== 'playing') return;
    setSelectedCardIndex(index);

    // Si une valeur est déjà verrouillée pour la séquence en cours,
    // on saute le ValueSelector et on joue direct avec la valeur verrouillée.
    // Le joueur n'a pas le droit de changer la valeur déclarée.
    if (state.currentDeclaredValue !== null) {
      dispatch({
        type: 'PLAY_CARD',
        playerId: currentPlayerId,
        cardIndex: index,
        declaredValue: state.currentDeclaredValue,
      });
      setSelectedCardIndex(null);
      setTimeout(() => setTurnPhase('pass_device'), 1500);
      return;
    }

    setShowValueSelector(true);
  }, [turnPhase, state.currentDeclaredValue, currentPlayerId]);

  const handleDeclareValue = useCallback((value: CardValue) => {
    if (selectedCardIndex === null || !currentPlayerId) return;
    setShowValueSelector(false);

    // Refus défensif: la valeur verrouillée prime (engine la force aussi)
    const actualValue =
      state.currentDeclaredValue !== null ? state.currentDeclaredValue : value;

    dispatch({
      type: 'PLAY_CARD',
      playerId: currentPlayerId,
      cardIndex: selectedCardIndex,
      declaredValue: actualValue,
    });
    setSelectedCardIndex(null);

    // After playing, go to challenge phase automatically
    // In 2-player local, the other player decides
    setTimeout(() => {
      setTurnPhase('pass_device');
    }, 1500);
  }, [selectedCardIndex, currentPlayerId, state.currentDeclaredValue]);

  const handleChallenge = useCallback(() => {
    const otherPlayerId = currentPlayerId === PLAYER_1_ID ? PLAYER_2_ID : PLAYER_1_ID;
    dispatch({ type: 'CHALLENGE', challengerId: otherPlayerId });

    // Show reveal, then move to next turn
    setTimeout(() => {
      dispatch({ type: 'NEXT_TURN' });
      setTurnPhase('pass_device');
    }, 2500);
  }, [currentPlayerId]);

  const handlePassChallenge = useCallback(() => {
    dispatch({ type: 'PASS_CHALLENGE', playerId: currentPlayerId });
    setTurnPhase('pass_device');
  }, [currentPlayerId]);

  const handleNewRound = useCallback(() => {
    dispatch({ type: 'NEW_ROUND' });
    setTurnPhase('pass_device');
  }, []);

  const handleQuit = useCallback(() => {
    Alert.alert('Quitter', 'Voulez-vous quitter la partie?', [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui', onPress: () => router.back() },
    ]);
  }, [router]);

  // "Pass device" screen
  if (gameStarted && turnPhase === 'pass_device' && state.phase === 'playing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.passScreen}>
          <Ionicons name="swap-horizontal" size={48} color="#22c55e" />
          <Text style={styles.passTitle}>
            Tour de {currentPlayerName}
          </Text>
          <Text style={styles.passSubtitle}>
            Passez l'appareil à {currentPlayerName}
          </Text>
          <TouchableOpacity
            style={styles.readyButton}
            onPress={handleReadyToPlay}
          >
            <Text style={styles.readyButtonText}>Je suis prêt!</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quitLink} onPress={handleQuit}>
            <Text style={styles.quitLinkText}>Quitter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Challenge screen (for 2-player: other player decides)
  if (state.phase === 'challenging' && turnPhase === 'pass_device') {
    const challengerName = state.lastPlay?.playerId === PLAYER_1_ID
      ? PLAYER_2_NAME
      : PLAYER_1_NAME;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.passScreen}>
          <Text style={styles.passTitle}>
            {challengerName}, voulez-vous contester?
          </Text>
          <Text style={styles.passSubtitle}>
            {state.lastPlay
              ? `Un "${state.lastPlay.declaredValue}" a été déclaré`
              : ''}
          </Text>
          <View style={styles.challengeActions}>
            <TouchableOpacity
              style={styles.kdoubButton}
              onPress={handleChallenge}
            >
              <Text style={styles.kdoubButtonText}>KDOUB!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.passButton}
              onPress={handlePassChallenge}
            >
              <Text style={styles.passButtonText}>Passer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Round end
  if (state.phase === 'round_end') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.passScreen}>
          <Text style={styles.passTitle}>Manche terminée!</Text>
          <View style={styles.scores}>
            {state.players.map((p) => (
              <Text key={p.id} style={styles.scoreText}>
                {p.name}: {p.score} pts
              </Text>
            ))}
          </View>
          <TouchableOpacity
            style={styles.readyButton}
            onPress={handleNewRound}
          >
            <Text style={styles.readyButtonText}>Manche suivante</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Game over
  if (state.phase === 'game_over') {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.passScreen}>
          <Text style={{ fontSize: 48 }}>🏆</Text>
          <Text style={styles.passTitle}>{winner?.name} gagne!</Text>
          <View style={styles.scores}>
            {state.players.map((p) => (
              <Text key={p.id} style={styles.scoreText}>
                {p.name}: {p.score} pts
              </Text>
            ))}
          </View>
          <TouchableOpacity
            style={styles.readyButton}
            onPress={() => router.back()}
          >
            <Text style={styles.readyButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Active play screen
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Kdoub - Local</Text>
          <Text style={styles.turnLabel}>{currentPlayerName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Table */}
      <View style={styles.tableArea}>
        <GameTableComponent
          pile={state.pile}
          lastPlay={state.lastPlay}
          lastChallenge={state.lastChallenge}
          players={state.players}
          currentPlayerId={currentPlayerId}
          showReveal={state.phase === 'revealing'}
        />
      </View>

      {/* Hand */}
      <View style={styles.handArea}>
        <HandComponent
          cards={currentHand}
          selectedIndex={selectedCardIndex}
          onSelectCard={handleSelectCard}
          disabled={turnPhase !== 'playing'}
          isCurrentPlayer
          label={`Main de ${currentPlayerName}`}
        />
      </View>

      <ValueSelector
        visible={showValueSelector}
        onSelect={handleDeclareValue}
        onCancel={() => {
          setShowValueSelector(false);
          setSelectedCardIndex(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  passScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  passTitle: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginTop: 16,
  },
  passSubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  readyButton: {
    backgroundColor: '#22c55e',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 16,
  },
  readyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  quitLink: {
    marginTop: 20,
    paddingVertical: 8,
  },
  quitLinkText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  challengeActions: {
    gap: 12,
    alignItems: 'center',
  },
  kdoubButton: {
    backgroundColor: '#ef4444',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 16,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  kdoubButtonText: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 3,
  },
  passButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  passButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  scores: {
    marginVertical: 20,
    gap: 8,
  },
  scoreText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  turnLabel: {
    color: '#22c55e',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  tableArea: {
    flex: 3,
  },
  handArea: {
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
});
