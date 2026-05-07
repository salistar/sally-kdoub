/**
 * @file AppHeader.tsx
 * @description Shared header for every Kdoub screen. Includes:
 *   - Back button (optional)
 *   - Screen title
 *   - Language selector (modal with flags)
 *   - Theme toggle (sun / moon / system)
 *   - Gradient background that adapts to the active palette
 *
 * Drop <AppHeader title="..." /> at the top of any screen — it handles
 * status bar spacing via the safe-area inset.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useLocale, LOCALES, LocaleCode, ThemeMode } from '../contexts/AppProviders';
import { logger } from '../utils/logger';

interface Props {
  title?: string;
  showBack?: boolean;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}

const log = logger.scoped('AppHeader');

export default function AppHeader({ title, showBack = false, subtitle, rightSlot }: Props) {
  const router = useRouter();
  const { palette, isDark, mode, setMode } = useTheme();
  const { locale, setLocale, isRTL } = useLocale();

  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const currentLocale = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  const chooseLocale = (code: LocaleCode) => {
    log.explain(`l'utilisateur a choisi '${code}' → propagation à tous les écrans via le contexte`);
    setLocale(code);
    setLangOpen(false);
  };

  const chooseTheme = (m: ThemeMode) => {
    log.explain(`l'utilisateur a choisi le thème '${m}' → mise à jour du contexte, tous les écrans se rechargent`);
    setMode(m);
    setThemeOpen(false);
  };

  const themeIcon =
    mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'phone-portrait';

  return (
    <LinearGradient
      colors={palette.headerGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View
          style={[
            styles.row,
            { flexDirection: isRTL ? 'row-reverse' : 'row' },
          ]}
        >
          {/* Left : back or space */}
          <View style={styles.leftSlot}>
            {showBack ? (
              <TouchableOpacity
                onPress={() => {
                  log.screen('back pressed');
                  router.back();
                }}
                style={styles.iconBtn}
                hitSlop={12}
              >
                <Ionicons
                  name={isRTL ? 'chevron-forward' : 'chevron-back'}
                  size={24}
                  color={palette.text}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.brandBadge}>
                <Text style={styles.brandText}>K</Text>
              </View>
            )}
          </View>

          {/* Center : title + subtitle */}
          <View style={styles.titleBox}>
            {title ? (
              <Text
                style={[styles.title, { color: palette.text, textAlign: isRTL ? 'right' : 'left' }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  { color: palette.textSecondary, textAlign: isRTL ? 'right' : 'left' },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* Right : theme + lang + optional extra */}
          <View style={[styles.rightSlot, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {rightSlot}
            <TouchableOpacity
              onPress={() => setThemeOpen(true)}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons name={themeIcon as any} size={22} color={palette.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLangOpen(true)}
              style={styles.langBtn}
              hitSlop={8}
            >
              <Text style={styles.flag}>{currentLocale.flag}</Text>
              <Text style={[styles.langCode, { color: palette.text }]}>
                {currentLocale.code.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Language picker modal ── */}
      <Modal
        visible={langOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setLangOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: isDark ? '#1E1B3A' : '#FFFFFF' }]}
          >
            <Text style={[styles.sheetTitle, { color: palette.text }]}>
              🌍 {isRTL ? 'اختر اللغة' : 'Language / Langue'}
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {LOCALES.map((l) => {
                const active = l.code === locale;
                return (
                  <TouchableOpacity
                    key={l.code}
                    onPress={() => chooseLocale(l.code)}
                    style={[
                      styles.langRow,
                      {
                        backgroundColor: active
                          ? palette.accent + '22'
                          : 'transparent',
                        borderColor: active ? palette.accent : palette.border,
                      },
                    ]}
                  >
                    <Text style={styles.langRowFlag}>{l.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.langRowNative, { color: palette.text }]}>
                        {l.native}
                      </Text>
                      <Text
                        style={[
                          styles.langRowLabel,
                          { color: palette.textSecondary },
                        ]}
                      >
                        {l.label}
                      </Text>
                    </View>
                    {active && (
                      <Ionicons name="checkmark-circle" size={22} color={palette.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Theme picker modal ── */}
      <Modal
        visible={themeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThemeOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setThemeOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: isDark ? '#1E1B3A' : '#FFFFFF' }]}
          >
            <Text style={[styles.sheetTitle, { color: palette.text }]}>🎨 Theme</Text>
            {(
              [
                { m: 'light' as const,  icon: 'sunny' as const,           label: 'Light' },
                { m: 'dark' as const,   icon: 'moon' as const,            label: 'Dark' },
                { m: 'system' as const, icon: 'phone-portrait' as const,  label: 'System' },
              ]
            ).map(({ m, icon, label }) => {
              const active = mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => chooseTheme(m)}
                  style={[
                    styles.langRow,
                    {
                      backgroundColor: active
                        ? palette.accent + '22'
                        : 'transparent',
                      borderColor: active ? palette.accent : palette.border,
                    },
                  ]}
                >
                  <Ionicons name={icon} size={22} color={palette.text} />
                  <Text style={[styles.langRowNative, { color: palette.text, marginLeft: 14 }]}>
                    {label}
                  </Text>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={palette.accent}
                      style={{ marginLeft: 'auto' }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { width: '100%' },
  safeArea: {},
  row: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  leftSlot: { width: 40, alignItems: 'center', justifyContent: 'center' },
  rightSlot: { alignItems: 'center', gap: 4 },
  titleBox: { flex: 1, paddingHorizontal: 8 },
  title: { fontSize: 20, fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  subtitle: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  langBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  flag: { fontSize: 18 },
  langCode: { fontSize: 12, fontFamily: 'Inter-Bold' },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  brandText: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Black' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    gap: 12,
  },
  langRowFlag: { fontSize: 26 },
  langRowNative: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  langRowLabel: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 2 },
});
