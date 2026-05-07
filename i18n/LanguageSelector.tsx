import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_META, type SupportedLocale, changeLanguage } from './i18n.config';
import { useRTL } from './RTLProvider';

interface LanguageOption {
  locale: SupportedLocale;
  flag: string;
  nativeName: string;
  preview: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    locale: 'darija',
    flag: LANGUAGE_META.darija.flag,
    nativeName: LANGUAGE_META.darija.nativeName,
    preview: '\u0645\u0631\u062D\u0628\u0627 \u0628\u064A\u0643 \u0641 \u0633\u0627\u0644\u064A \u0643\u0627\u0631\u062F\u0632', // مرحبا بيك ف سالي كاردز
  },
  {
    locale: 'ar',
    flag: LANGUAGE_META.ar.flag,
    nativeName: LANGUAGE_META.ar.nativeName,
    preview: '\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643 \u0641\u064A \u0633\u0627\u0644\u064A \u0643\u0627\u0631\u062F\u0632', // مرحباً بك في سالي كاردز
  },
  {
    locale: 'fr',
    flag: LANGUAGE_META.fr.flag,
    nativeName: LANGUAGE_META.fr.nativeName,
    preview: 'Bienvenue sur Sally Cards',
  },
  {
    locale: 'en',
    flag: LANGUAGE_META.en.flag,
    nativeName: LANGUAGE_META.en.nativeName,
    preview: 'Welcome to Sally Cards',
  },
  {
    locale: 'es',
    flag: LANGUAGE_META.es.flag,
    nativeName: LANGUAGE_META.es.nativeName,
    preview: 'Bienvenido a Sally Cards',
  },
];

interface LanguageSelectorProps {
  /** Called after the language is changed */
  onSelect?: (locale: SupportedLocale) => void;
}

export function LanguageSelector({ onSelect }: LanguageSelectorProps): React.ReactElement {
  const { i18n } = useTranslation();
  const { flexDirection } = useRTL();
  const currentLocale = i18n.language as SupportedLocale;

  const handleSelect = (locale: SupportedLocale) => {
    changeLanguage(locale);
    onSelect?.(locale);
  };

  const renderItem = ({ item }: { item: LanguageOption }) => {
    const isActive = item.locale === currentLocale;

    return (
      <TouchableOpacity
        style={[
          styles.languageItem,
          isActive && styles.languageItemActive,
        ]}
        onPress={() => handleSelect(item.locale)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${item.nativeName} ${item.flag}`}
      >
        <View style={[styles.languageHeader, { flexDirection }]}>
          <Text style={styles.flag}>{item.flag}</Text>
          <Text
            style={[
              styles.nativeName,
              isActive && styles.nativeNameActive,
            ]}
          >
            {item.nativeName}
          </Text>
          {isActive && <Text style={styles.checkmark}>{'\u2713'}</Text>}
        </View>
        <Text
          style={[
            styles.preview,
            isActive && styles.previewActive,
            item.locale === 'ar' || item.locale === 'darija'
              ? styles.rtlText
              : styles.ltrText,
          ]}
          numberOfLines={1}
        >
          {item.preview}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={LANGUAGE_OPTIONS}
        renderItem={renderItem}
        keyExtractor={(item) => item.locale}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  languageItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageItemActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  languageHeader: {
    alignItems: 'center',
    marginBottom: 4,
    gap: 10,
  },
  flag: {
    fontSize: 24,
  },
  nativeName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  nativeNameActive: {
    color: '#4F46E5',
  },
  checkmark: {
    fontSize: 18,
    color: '#4F46E5',
    fontWeight: '700',
  },
  preview: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    paddingLeft: 34,
  },
  previewActive: {
    color: '#6366F1',
  },
  rtlText: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ltrText: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
});
