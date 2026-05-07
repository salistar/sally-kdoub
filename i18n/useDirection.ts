import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RTL_LANGUAGES, type SupportedLocale } from './i18n.config';

export interface DirectionInfo {
  isRTL: boolean;
  direction: 'rtl' | 'ltr';
  flexDirection: 'row' | 'row-reverse';
  textAlign: 'right' | 'left';
  start: 'right' | 'left';
  end: 'left' | 'right';
}

/**
 * Hook that returns layout direction info based on the current i18n language.
 * Use this for styling components that need to adapt to RTL/LTR layouts.
 */
export function useDirection(): DirectionInfo {
  const { i18n } = useTranslation();
  const isRTL = RTL_LANGUAGES.includes(i18n.language as SupportedLocale);

  return useMemo<DirectionInfo>(
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
}
