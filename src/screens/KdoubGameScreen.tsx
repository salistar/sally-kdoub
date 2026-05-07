import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  GameState,
  GameAction,
  CardValue,
  gameReducer,
  createInitialState,
  getCurrentPlayer,
  isPlayerTurn,
  createBots,
  botPlayCard,
  botShouldChallenge,
} from '../game/kdoubEngine';
import HandComponent from '../components/HandComponent';
import GameTableComponent from '../components/GameTableComponent';
import ValueSelector from '../components/ValueSelector';

const PLAYER_ID = 'player-1';
const PLAYER_NAME = 'Vous';

export default function KdoubGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; botCount?: string }>();

  const mode = params.mode || 'bot';
  const botCount = parseInt(params.botCount || '1', 10);

  const [state, dispatch] = useReducer(gameReducer, createInitialState());
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const challengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botActionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize game
  useEffect(() => {
    dispatch({
      type: 'JOIN',
      playerId: PLAYER_ID,
      playerName: PLAYER_NAME,
    });

    const bots = createBots(Math.min(botCount, 5));
    bots.forEach((action) => dispatch(action));

    // Small delay then start
    const timer = setTimeout(() => {
      dispatch({ type: 'START_GAME' });
    }, 500);

    return () => {
      clearTimeout(timer);
      if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current);
      if (botActionRef.current) clearTimeout(botActionRef.current);
    };
  }, [botCount]);

  // Bot play logic
  useEffect(() => {
    if (state.phase !== 'playing') return;

    const current = getCurrentPlayer(state);
    if (!current || !current.isBot) return;

    // Bot plays after a delay
    botActionRef.current = setTimeout(() => {
      const { cardIndex, declaredValue } = botPlayCard(
        current,
        state.currentDeclaredValue
      );

      dispatch({
        type: 'PLAY_CARD',
        playerId: current.id,
        cardIndex,
        declaredValue,
      });
    }, 1000 + Math.random() * 1500);

    return () => {
      if (botActionRef.current) clearTimeout(botActionRef.current);
    };
  }, [state.phase, state.currentPlayerIndex]);

  // Bot challenge logic
  useEffect(() => {
    if (state.phase !== 'challenging' || !state.lastPlay) return;

    // Check if any bot wants to challenge
    const botPlayers = state.players.filter(
      (p) => p.isBot && p.id !== state.lastPlay?.playerId
    );

    let challenged = false;

    botActionRef.current = setTimeout(() => {
      for (const bot of botPlayers) {
        if (botShouldChallenge(bot, state.lastPlay!, state.pile.length)) {
          dispatch({ type: 'CHALLENGE', challengerId: bot.id });
          challenged = true;
          break;
        }
      }

      // If no bot challenged and human already passed (or it's bot's own play)
      if (!challenged && state.lastPlay?.playerId !== PLAYER_ID) {
        // Auto-pass for bots if human hasn't challenged yet
        // The timer below handles auto-pass
      }
    }, 1500 + Math.random() * 1000);

    // Auto-pass challenge after timeout
    challengeTimerRef.current = setTimeout(() => {
      if (state.phase === 'challenging') {
        dispatch({ type: 'PASS_CHALLENGE', playerId: PLAYER_ID });
      }
    }, 5000);

    return () => {
      if (botActionRef.current) clearTimeout(botActionRef.current);
      if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current);
    };
  }, [state.phase, state.lastPlay?.playerId]);

  // Auto-advance after reveal
  useEffect(() => {
    if (state.phase !== 'revealing') return;

    const timer = setTimeout(() => {
      dispatch({ type: 'NEXT_TURN' });
    }, 2500);

    return () => clearTimeout(timer);
  }, [state.phase]);

  // Handlers
  const handleSelectCard = useCallback((index: number) => {
    if (!isPlayerTurn(state, PLAYER_ID)) return;
    setSelectedCardIndex(index);
    setShowValueSelector(true);
  }, [state.currentPlayerIndex, state.phase]);

  const handleDeclareValue = useCallback((value: CardValue) => {
    if (selectedCardIndex === null) return;

    setShowValueSelector(false);
    dispatch({
      type: 'PLAY_CARD',
      playerId: PLAYER_ID,
      cardIndex: selectedCardIndex,
      declaredValue: value,
    });
    setSelectedCardIndex(null);
  }, [selectedCardIndex]);

  const handleChallenge = useCallback(() => {
    if (challengeTimerRef.current) clearTimeout(challengeTimerRef.current);
    dispatch({ type: 'CHALLENGE', challengerId: PLAYER_ID });
  }, []);

  const handleNewRound = useCallback(() => {
    dispatch({ type: 'NEW_ROUND' });
  }, []);

  const handlePlayAgain = useCallback(() => {
    dispatch({ type: 'RESET' });
    // Re-init
    dispatch({ type: 'JOIN', playerId: PLAYER_ID, playerName: PLAYER_NAME });
    const bots = createBots(botCount);
    bots.forEach((action) => dispatch(action));
    setTimeout(() => dispatch({ type: 'START_GAME' }), 300);
  }, [botCount]);

  const handleQuit = useCallback(() => {
    Alert.alert('Quitter', 'Voulez-vous quitter la partie?', [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui', onPress: () => router.back() },
    ]);
  }, [router]);

  // Get player data
  const humanPlayer = state.players.find((p) => p.id === PLAYER_ID);
  const currentPlayer = getCurrentPlayer(state);
  const isMyTurn = isPlayerTurn(state, PLAYER_ID);
  const canChallenge =
    state.phase === 'challenging' &&
    state.lastPlay?.playerId !== PLAYER_ID;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleQuit} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Kdoub</Text>
          <Text style={styles.roundText}>
            Manche {state.roundNumber}/{state.maxRounds}
          </Text>
        </View>
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Score</Text>
          <Text style={styles.scoreValue}>{humanPlayer?.score ?? 0}</Text>
        </View>
      </View>

      {/* Game Table */}
      <View style={styles.tableArea}>
        <GameTableComponent
          pile={state.pile}
          lastPlay={state.lastPlay}
          lastChallenge={state.lastChallenge}
          players={state.players}
          currentPlayerId={currentPlayer?.id || ''}
          showReveal={state.phase === 'revealing'}
        />
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        {state.phase === 'playing' && (
          <Text style={styles.statusText}>
            {isMyTurn
              ? '🃏 Votre tour - Choisissez une carte'
              : `⏳ ${currentPlayer?.name || '...'} joue...`
            }
          </Text>
        )}
        {state.phase === 'challenging' && (
          <View style={styles.challengeBar}>
            <Text style={styles.statusText}>
              {canChallenge
                ? '🤔 Bluff? Appuyez sur Kdoub!'
                : '⏳ En attente de contestation...'
              }
            </Text>
            {canChallenge && (
              <TouchableOpacity
                style={styles.kdoubButton}
                onPress={handleChallenge}
                activeOpacity={0.8}
              >
                <Text style={styles.kdoubButtonText}>KDOUB!</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {state.phase === 'revealing' && (
          <Text style={styles.statusText}>
            {state.lastChallenge?.wasBluff
              ? '🎭 C\'était un bluff!'
              : '✅ Il disait la vérité!'
            }
          </Text>
        )}
        {state.phase === 'round_end' && (
          <View style={styles.roundEndBar}>
            <Text style={styles.statusText}>Manche terminée!</Text>
            <TouchableOpacity
              style={styles.nextRoundButton}
              onPress={handleNewRound}
            >
              <Text style={styles.nextRoundText}>Manche suivante</Text>
            </TouchableOpacity>
          </View>
        )}
        {state.phase === 'game_over' && (
          <View style={styles.gameOverBar}>
            <Text style={styles.gameOverText}>
              {state.winnerId === PLAYER_ID
                ? '🏆 Vous avez gagné!'
                : `${state.players.find(p => p.id === state.winnerId)?.name} a gagné!`
              }
            </Text>
            <TouchableOpacity
              style={styles.nextRoundButton}
              onPress={handlePlayAgain}
            >
              <Text style={styles.nextRoundText}>Rejouer</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Player Hand */}
      <View style={styles.handArea}>
        {humanPlayer && (
          <HandComponent
            cards={humanPlayer.hand}
            selectedIndex={selectedCardIndex}
            onSelectCard={handleSelectCard}
            disabled={!isMyTurn || state.phase !== 'playing'}
            isCurrentPlayer={isMyTurn}
            label="Votre main"
          />
        )}
      </View>

      {/* Value Selector Modal */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
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
    fontSize: 18,
    fontFamily: 'Inter-Black',
  },
  roundText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  scoreContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  scoreLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    textTransform: 'uppercase',
  },
  scoreValue: {
    color: '#22c55e',
    fontSize: 18,
    fontFamily: 'Inter-Black',
  },
  tableArea: {
    flex: 3,
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    minHeight: 52,
    justifyContent: 'center',
  },
  statusText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  challengeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  kdoubButton: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  kdoubButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Black',
    letterSpacing: 2,
  },
  roundEndBar: {
    alignItems: 'center',
    gap: 10,
  },
  gameOverBar: {
    alignItems: 'center',
    gap: 10,
  },
  gameOverText: {
    color: '#fbbf24',
    fontSize: 18,
    fontFamily: 'Inter-Black',
    textAlign: 'center',
  },
  nextRoundButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  nextRoundText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  handArea: {
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
});
