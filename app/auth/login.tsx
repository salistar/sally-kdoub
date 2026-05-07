/**
 * @file login.tsx
 * @description Login screen for the Kdoub app. Card image logo, email/password authentication, guest mode, and demo credentials.
 * @author Idriss Kriouile
 * @date 2026-04-05
 * @project SallyCards - Kdoub
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as api from '../../shared/api';
import { APP_CONFIG } from '../../src/config/app.config';

const APP_COLOR = APP_CONFIG.primary;
const APP_NAME = APP_CONFIG.name;
const CARD_IMAGE = require('../../assets/cards/12O.png');

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('demo@sallycards.com');
  const [password, setPassword] = useState('Demo123456');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[Kdoub/Login] Component mounted');
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      console.log('[Kdoub/Login] Validation failed: empty fields');
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    setLoading(true);
    try {
      console.log('[Kdoub/Login] Fetching login...');
      await api.login(email, password, { gameType: 'kdoub' });
      console.log('[Kdoub/Login] Login successful');
      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('[Kdoub/Login] Error:', e);
      Alert.alert(t('error'), e.message || t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      console.log('[Kdoub/Login] Fetching guest session...');
      await api.createGuestSession();
      console.log('[Kdoub/Login] Guest session created');
      router.replace('/(tabs)');
    } catch (e: any) {
      console.error('[Kdoub/Login] Error:', e);
      Alert.alert(t('error'), e.message || t('guestError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Image source={CARD_IMAGE} style={s.cardImage} resizeMode="contain" />

        <View style={s.titleRow}>
          <Text style={s.sallyText}>Sally</Text>
          <Text style={[s.appNameText, { color: APP_COLOR }]}>{APP_NAME}</Text>
        </View>
        <Text style={s.subtitle}>{t('loginSubtitle')}</Text>

        <View style={s.form}>
          <Text style={s.label}>{t('email')}</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="demo@sallycards.com"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={s.label}>{t('password')}</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="********"
            placeholderTextColor="#6B7280"
            secureTextEntry
          />

          <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>{t('loginButton')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.guestButton} onPress={handleGuest} disabled={loading}>
            <Text style={s.guestText}>{t('guest')}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.credentials}>
          <Text style={s.credTitle}>{t('demoAccount')}</Text>
          <Text style={s.credText}>Email: demo@sallycards.com</Text>
          <Text style={s.credText}>Pass: Demo123456</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0520' },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  cardImage: { width: 80, height: 120, alignSelf: 'center', marginBottom: 16 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  sallyText: { fontSize: 28, fontWeight: '900', color: '#fff' },
  appNameText: { fontSize: 28, fontWeight: '900' },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  form: { gap: 12 },
  label: { color: '#9CA3AF', fontSize: 13, fontWeight: '600', marginBottom: -4 },
  input: {
    backgroundColor: '#152A47',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  button: {
    backgroundColor: APP_COLOR,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  guestButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  guestText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  credentials: {
    marginTop: 32,
    padding: 16,
    backgroundColor: 'rgba(124,58,237,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
  },
  credTitle: { color: APP_COLOR, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  credText: { color: '#6B7280', fontSize: 12 },
});

/* === End of login.tsx -- Kdoub -- SallyCards === */
