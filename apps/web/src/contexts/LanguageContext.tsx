import React, { createContext, ReactNode, useState, useEffect } from 'react';
import i18n from '@/i18n/i18n';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';

/**
 * Language Context: Single source of truth for app language
 * Manages: language state, persistence, i18n sync
 * Provides: language, setLanguage
 */

interface LanguageContextType {
  language: 'he' | 'en';
  setLanguage: (lang: 'he' | 'en') => void;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userLanguage, setUserLanguage, isLoaded } = useLanguagePreference();
  const [language, setLanguageState] = useState<'he' | 'en'>(userLanguage);

  // On mount: sync i18n language with localStorage value
  // This ensures i18n and Context start in sync
  useEffect(() => {
    if (!isLoaded) return;
    
    const currentI18nLang = i18n.language as 'he' | 'en';
    if (currentI18nLang !== userLanguage) {
      i18n.changeLanguage(userLanguage);
    }
  }, [isLoaded, userLanguage]);

  // Sync language state when i18n updates externally
  useEffect(() => {
    const handleLanguageChanged = () => {
      const currentLang = i18n.language as 'he' | 'en';
      if (currentLang === 'he' || currentLang === 'en') {
        setLanguageState(currentLang);
      }
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  const setLanguage = (lang: 'he' | 'en') => {
    setLanguageState(lang);
    setUserLanguage(lang); // Persist to localStorage
    i18n.changeLanguage(lang); // Update i18n — triggers languageChanged event
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
