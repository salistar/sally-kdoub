/**
 * @file settings.tsx
 * @description Settings modal for Kdoub. Language + Theme now driven by
 * the shared AppProviders context — toggles propagate instantly to EVERY
 * mounted screen. No more dead setState.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AppHeader from '../src/components/AppHeader';
import { useTheme, useLocale, LOCALES, LocaleCode, ThemeMode } from '../src/contexts/AppProviders';
import { logger } from '../src/utils/logger';
import * as api from '../shared/api';

const log = logger.scoped('SettingsScreen');

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: React.ReactNode;
  onPress?: () => void;
  palette: ReturnType<typeof useTheme>['palette'];
  danger?: boolean;
}

function SettingRow({ icon, label, value, onPress, palette, danger }: RowProps) {
  const color = danger ? palette.danger : palette.text;
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: palette.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Ionicons name={icon} size={22} color={danger ? palette.danger : palette.textSecondary} />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <View>{value}</View>
      {onPress && <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { palette, mode, setMode } = useTheme();
  const { locale, setLocale } = useLocale();

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  const openLangPicker = () => {
    log.screen('opening language picker');
    Alert.alert(
      t('chooseLanguage') ?? 'Language',
      undefined,
      LOCALES.map((lang) => ({
        text: `${lang.flag}  ${lang.native}`,
        onPress: async () => {
          log.explain(`utilisateur a choisi '${lang.code}' → sauvegarde + broadcast au contexte`);
          setLocale(lang.code as LocaleCode);
          try {
            log.bin('PATCH /users/me', { language: lang.code });
            await api.updateProfile({ settings: { language: lang.code } } as any);
            log.bout('200 /users/me');
          } catch (e) {
            log.error('PATCH /users/me failed', e);
          }
        },
      })),
    );
  };

  const openThemePicker = () => {
    log.screen('opening theme picker');
    Alert.alert(t('theme') ?? 'Theme', undefined, [
      { text: t('system') ?? 'System', onPress: () => setMode('system' as ThemeMode) },
      { text: t('light') ?? 'Light',   onPress: () => setMode('light'  as ThemeMode) },
      { text: t('dark') ?? 'Dark',     onPress: () => setMode('dark'   as ThemeMode) },
    ]);
  };

  return (
    <View style={[s.container, { backgroundColor: palette.bg }]}>
      <LinearGradient colors={palette.bgGradient} style={StyleSheet.absoluteFill} />
      <AppHeader title={t('settings') ?? 'Settings'} showBack />

      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={[s.sectionTitle, { color: palette.textSecondary }]}>
          {t('general') ?? 'General'}
        </Text>
        <LinearGradient colors={palette.cardGradient} style={[s.section, { borderColor: palette.border }]}>
          <SettingRow
            icon="language"
            label={t('language') ?? 'Language'}
            value={<Text style={{ color: palette.textSecondary, fontFamily: 'Inter-Regular' }}>
              {current.flag} {current.native}
            </Text>}
            onPress={openLangPicker}
            palette={palette}
          />
          <SettingRow
            icon="color-palette"
            label={t('theme') ?? 'Theme'}
            value={<Text style={{ color: palette.textSecondary, fontFamily: 'Inter-Regular' }}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>}
            onPress={openThemePicker}
            palette={palette}
          />
        </LinearGradient>

        <Text style={[s.sectionTitle, { color: palette.textSecondary }]}>
          {t('audioHaptics') ?? 'Audio & Haptics'}
        </Text>
        <LinearGradient colors={palette.cardGradient} style={[s.section, { borderColor: palette.border }]}>
          <SettingRow
            icon="volume-high"
            label={t('soundEffects') ?? 'Sound Effects'}
            value={<Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#444', true: palette.accent }} />}
            palette={palette}
          />
          <SettingRow
            icon="phone-portrait"
            label={t('haptic') ?? 'Haptic Feedback'}
            value={<Switch value={hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: '#444', true: palette.accent }} />}
            palette={palette}
          />
        </LinearGradient>

        <Text style={[s.sectionTitle, { color: palette.textSecondary }]}>
          {t('notifications') ?? 'Notifications'}
        </Text>
        <LinearGradient colors={palette.cardGradient} style={[s.section, { borderColor: palette.border }]}>
          <SettingRow
            icon="notifications"
            label={t('pushNotif') ?? 'Push Notifications'}
            value={<Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: '#444', true: palette.accent }} />}
            palette={palette}
          />
        </LinearGradient>

        <Text style={[s.sectionTitle, { color: palette.textSecondary }]}>
          {t('account') ?? 'Account'}
        </Text>
        <LinearGradient colors={palette.cardGradient} style={[s.section, { borderColor: palette.border }]}>
          <SettingRow
            icon="download"
            label={t('exportData') ?? 'Export My Data'}
            onPress={() => Alert.alert(t('exportData') ?? 'Export', 'Your data will be prepared.')}
            palette={palette}
          />
          <SettingRow
            icon="log-out"
            label={t('signOut') ?? 'Sign Out'}
            onPress={async () => {
              log.bin('POST /auth/logout (local)');
              await api.logout();
              log.bout('200 logout');
              log.screen('nav → /');
              router.replace('/');
            }}
            palette={palette}
          />
        </LinearGradient>

        <Text style={[s.sectionTitle, { color: palette.danger }]}>
          {t('dangerZone') ?? 'Danger Zone'}
        </Text>
        <LinearGradient colors={palette.cardGradient} style={[s.section, { borderColor: palette.border }]}>
          <SettingRow
            icon="trash"
            label={t('deleteAccount') ?? 'Delete Account'}
            onPress={() => Alert.alert(t('deleteAccount') ?? 'Delete', 'Permanent action.', [
              { text: t('cancel') ?? 'Cancel', style: 'cancel' },
              { text: t('delete') ?? 'Delete', style: 'destructive' },
            ])}
            palette={palette}
            danger
          />
        </LinearGradient>

        <View style={s.footer}>
          <Text style={[s.footerText, { color: palette.textSecondary }]}>SallyCards · Kdoub v1.0.0</Text>
          <Text style={[s.footerText, { color: palette.textSecondary }]}>salistarcompany@gmail.com</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12, fontFamily: 'Inter-Bold',
    textTransform: 'uppercase', letterSpacing: 1.5,
    marginTop: 24, marginBottom: 8, marginLeft: 20,
  },
  section: {
    borderRadius: 16, marginHorizontal: 16, overflow: 'hidden',
    borderWidth: 1,
  },
  footer: { alignItems: 'center', marginTop: 32, gap: 4 },
  footerText: { fontSize: 12, fontFamily: 'Inter-Regular' },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: 'Inter-SemiBold' },
});

/* === End of settings.tsx — Kdoub === */
