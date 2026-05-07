import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RTL_LANGUAGES, type SupportedLocale } from './i18n.config';

export interface RTLContextValue {
  isRTL: boolean;
  direction: 'rtl' | 'ltr';
  flexDirection: 'row' | 'row-reverse';
  textAlign: 'right' | 'left';
  start: 'right' | 'left';
  end: 'left' | 'right';
}

const defaultValue: RTLContextValue = {
  isRTL: false,
  direction: 'ltr',
  flexDirection: 'row',
  textAlign: 'left',
  start: 'left',
  end: 'right',
};

const RTLContext = createContext<RTLContextValue>(defaultValue);

export function useRTL(): RTLContextValue {
  return useContext(RTLContext);
}

interface RTLProviderProps {
  children: React.ReactNode;
}

export function RTLProvider({ children }: RTLProviderProps): React.ReactElement {
  const { i18n } = useTranslation();
  const [isRTL, setIsRTL] = useState(() =>
    RTL_LANGUAGES.includes(i18n.language as SupportedLocale)
  );

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const rtl = RTL_LANGUAGES.includes(lng as SupportedLocale);
      setIsRTL(rtl);
      I18nManager.forceRTL(rtl);
      I18nManager.allowRTL(rtl);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  const value = useMemo<RTLContextValue>(
    () => ({
      isRTL,
      direction: isRTL ? 'rtl' : 'ltr',
      flexDirection: isRTL ? 'row-reverse' : 'row',
      textAlign: isRTL ? 'right' : 'left',
      start: isRTL ? 'right' : 'left',
      end: isRTL ? 'left' : 'right',
    }),
    [isRTL]
  );

  return <RTLContext.Provider value={value}>{children}</RTLContext.Provider>;
}
