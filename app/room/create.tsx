/**
 * @file room/create.tsx
 * @description Création d'une room Kdoub. Sliders pour maxPlayers (2-10),
 * choix public/privé, puis partage du code via expo-sharing.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../../src/components/AppHeader';
import { useTheme } from '../../src/contexts/AppProviders';
import { logger } from '../../src/utils/logger';
import * as api from '../../shared/api';

const log = logger.scoped('CreateRoom');

export default function CreateRoomScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    setCreating(true);
    // Client MINCE : on génère un code de salon localement et on va DIRECTEMENT
    // dans la table /game. Le serveur crée la room `kdoub:CODE` au premier
    // game:join + remplit les sièges vides avec des bots. Parité belote/web.
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    log.explain(`salon ${code} créé localement → /game/${code}`);
    router.replace(`/game/${code}`);
  };

  const styles = createStyles(palette);

  return (
    <View style={styles.root}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('createRoomTitle')} showBack />

      <View style={styles.body}>
        <Text style={[styles.label, { color: palette.text }]}>{t('maxPlayersLabel')}</Text>
        <View style={styles.playerSelector}>
          {[2, 3, 4, 5, 6, 8, 10].map((n) => {
            const active = maxPlayers === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => {
                  log.screen('maxPlayers', n);
                  setMaxPlayers(n);
                }}
                style={[
                  styles.playerChip,
                  {
                    backgroundColor: active ? palette.accent : palette.card,
                    borderColor: active ? palette.accent : palette.border,
                  },
                ]}
              >
                <Text style={[styles.playerChipText, { color: active ? '#fff' : palette.text }]}>
                  {n}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: palette.text, marginTop: 28 }]}>{t('visibilityLabel')}</Text>
        <View style={styles.modeRow}>
          <TouchableOpacity
            onPress={() => setIsPrivate(false)}
            style={[
              styles.modeCard,
              {
                backgroundColor: !isPrivate ? palette.accent + '22' : palette.card,
                borderColor: !isPrivate ? palette.accent : palette.border,
              },
            ]}
          >
            <Ionicons name="globe-outline" size={28} color={!isPrivate ? palette.accent : palette.textSecondary} />
            <Text style={[styles.modeTitle, { color: palette.text }]}>{t('public')}</Text>
            <Text style={[styles.modeDesc, { color: palette.textSecondary }]}>
              {t('publicDesc')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsPrivate(true)}
            style={[
              styles.modeCard,
              {
                backgroundColor: isPrivate ? palette.accent + '22' : palette.card,
                borderColor: isPrivate ? palette.accent : palette.border,
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={28} color={isPrivate ? palette.accent : palette.textSecondary} />
            <Text style={[styles.modeTitle, { color: palette.text }]}>{t('private')}</Text>
            <Text style={[styles.modeDesc, { color: palette.textSecondary }]}>
              {t('privateDesc')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={handleCreate}
          disabled={creating}
          style={styles.createBtn}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={palette.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtnGrad}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="rocket" size={22} color="#fff" />
                <Text style={styles.createBtnText}>{t('createRoom')}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useTheme>['palette']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    body: { padding: 20 },
    label: { fontSize: 14, fontFamily: 'Inter-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
    playerSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    playerChip: {
      width: 56, height: 56, borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    playerChipText: { fontSize: 20, fontFamily: 'Inter-Black' },
    modeRow: { flexDirection: 'row', gap: 12 },
    modeCard: {
      flex: 1, padding: 16, borderRadius: 16,
      borderWidth: 2, alignItems: 'center', gap: 6,
    },
    modeTitle: { fontSize: 16, fontFamily: 'Inter-Bold', marginTop: 6 },
    modeDesc: { fontSize: 11, fontFamily: 'Inter-Regular', textAlign: 'center' },
    createBtn: { marginTop: 40, borderRadius: 16, overflow: 'hidden' },
    createBtnGrad: {
      paddingVertical: 18,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    createBtnText: { color: '#fff', fontSize: 17, fontFamily: 'Inter-Black', letterSpacing: 1 },
  });
}
