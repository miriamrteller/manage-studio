import { useEffect } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { languageToDir } from '@/lib/resolve-language';

export function DocumentLanguageSync() {
  const { language } = useLanguage();

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = languageToDir(language);
  }, [language]);

  return null;
}
