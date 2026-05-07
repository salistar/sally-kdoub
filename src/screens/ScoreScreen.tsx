import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface PlayerScore {
  name: string;
  score: number;
  isWinner: boolean;
}

export default function ScoreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scores?: string; winnerId?: string }>();

  let players: PlayerScore[] = [];
  try {
    players = JSON.parse(params.scores || '[]');
  } catch {
    players = [];
  }

  const sorted = [...players].sort((a, b) => a.score - b.score);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.replace('/(tabs)')}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Résultats</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Trophy */}
        <View style={styles.trophyContainer}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.winnerName}>
            {sorted[0]?.name || 'Gagnant'}
          </Text>
          <Text style={styles.winnerLabel}>Champion!</Text>
        </View>

        {/* Scoreboard */}
        <View style={styles.scoreboard}>
          <Text style={styles.scoreboardTitle}>Classement final</Text>

          {sorted.map((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            return (
              <View
                key={index}
                style={[
                  styles.scoreRow,
                  index === 0 && styles.winnerRow,
                ]}
              >
                <View style={styles.rankArea}>
                  {medal ? (
                    <Text style={styles.medal}>{medal}</Text>
                  ) : (
                    <Text style={styles.rankNumber}>#{index + 1}</Text>
                  )}
                </View>
                <Text style={styles.playerName}>{player.name}</Text>
                <Text style={[
                  styles.playerScore,
                  index === 0 && styles.winnerScore,
                ]}>
                  {player.score} pts
                </Text>
              </View>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.playAgainButton}
            onPress={() => router.replace('/game/local?mode=bot&botCount=1')}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.playAgainText}>Rejouer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Ionicons name="home" size={18} color="rgba(255,255,255,0.6)" />
            <Text style={styles.homeText}>Accueil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  trophyContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  trophy: {
    fontSize: 64,
    marginBottom: 12,
  },
  winnerName: {
    color: '#fbbf24',
    fontSize: 24,
    fontFamily: 'Inter-Black',
  },
  winnerLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  scoreboard: {
    width: '100%',
    backgroundColor: '#152A47',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  scoreboardTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
  },
  winnerRow: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  rankArea: {
    width: 36,
    alignItems: 'center',
  },
  medal: {
    fontSize: 20,
  },
  rankNumber: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  playerName: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    marginLeft: 8,
  },
  playerScore: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  winnerScore: {
    color: '#22c55e',
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  playAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    borderRadius: 16,
    paddingVertical: 16,
  },
  playAgainText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  homeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
