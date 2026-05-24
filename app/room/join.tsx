/**
 * @file room/join.tsx
 * @description Rejoindre une room Kdoub — soit par code (input) soit
 * depuis la liste publique (tap sur une room → join).
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const log = logger.scoped('JoinRoom');

export default function JoinRoomScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [rooms, setRooms] = useState<api.RoomFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRooms = async () => {
    try {
      log.bin('GET /rooms?gameType=kdoub');
      const r = await api.listRoomsFull('kdoub');
      log.bout('200 /rooms', `${r.rooms.length} publiques`);
      setRooms(r.rooms);
    } catch (e) {
      log.error('listRooms failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    log.screen('mounted');
    loadRooms();
  }, []);

  const handleJoinByCode = async () => {
    if (code.length < 4) {
      Alert.alert(t('invalidCode'), t('invalidCodeDesc'));
      return;
    }
    const upperCode = code.trim().toUpperCase();
    // Client MINCE : on va DIRECTEMENT dans la table /game (le namespace /game
    // gère l'appartenance à la room côté serveur, pas de REST join). Parité web.
    log.explain(`join par code → /game/${upperCode}`);
    router.replace(`/game/${upperCode}`);
  };

  const handleJoinFromList = async (room: api.RoomFull) => {
    log.explain(`join depuis liste → /game/${room.code}`);
    router.replace(`/game/${room.code}`);
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('joinRoomTitle')} showBack />

      {/* Code input */}
      <View style={styles.codeBox}>
        <Text style={[styles.label, { color: palette.text }]}>{t('inviteCode')}</Text>
        <View style={[styles.inputRow, { borderColor: palette.border, backgroundColor: palette.card }]}>
          <Ionicons name="key-outline" size={20} color={palette.textSecondary} />
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor={palette.textSecondary}
            autoCapitalize="characters"
            maxLength={6}
            style={[styles.input, { color: palette.text }]}
          />
          <TouchableOpacity
            onPress={handleJoinByCode}
            disabled={joining || code.length < 4}
            style={[styles.joinBtn, { backgroundColor: code.length >= 4 ? palette.accent : palette.border }]}
          >
            {joining ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.joinBtnText}>{t('join')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Public rooms list */}
      <Text style={[styles.section, { color: palette.textSecondary }]}>
        {t('publicRooms')} ({rooms.length})
      </Text>
      {loading ? (
        <ActivityIndicator size="large" color={palette.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.code}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadRooms();
              }}
              tintColor={palette.accent}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={palette.textSecondary} />
              <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                {t('noPublicRooms')}
              </Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                {t('createOne')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleJoinFromList(item)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={palette.cardGradient}
                style={[styles.roomRow, { borderColor: palette.border }]}
              >
                <View style={styles.roomCodeBox}>
                  <Text style={[styles.roomCode, { color: palette.accent }]}>{item.code}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.roomHost, { color: palette.text }]}>
                    {item.players[0]?.username || t('host')}
                  </Text>
                  <Text style={[styles.roomMeta, { color: palette.textSecondary }]}>
                    {item.playersCount}/{item.maxPlayers} {t('playersWord')} · {item.status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={palette.textSecondary} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    codeBox: { padding: 16 },
    label: { fontSize: 13, fontFamily: 'Inter-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
    inputRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 6, gap: 10,
      borderRadius: 14, borderWidth: 1,
    },
    input: { flex: 1, fontSize: 20, fontFamily: 'Inter-Black', letterSpacing: 3, paddingVertical: 10 },
    joinBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    joinBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },
    section: { fontSize: 12, fontFamily: 'Inter-Bold', letterSpacing: 1, marginHorizontal: 20, marginTop: 16, marginBottom: 8 },
    list: { paddingHorizontal: 16, paddingBottom: 20 },
    roomRow: {
      flexDirection: 'row', alignItems: 'center',
      padding: 14, borderRadius: 14, marginBottom: 8,
      borderWidth: 1,
    },
    roomCodeBox: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    roomCode: { fontSize: 16, fontFamily: 'Inter-Black', letterSpacing: 2 },
    roomHost: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
    roomMeta: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
    empty: { alignItems: 'center', paddingTop: 40, gap: 6 },
    emptyText: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
    emptySub: { fontSize: 13, fontFamily: 'Inter-Regular' },
  });
}
