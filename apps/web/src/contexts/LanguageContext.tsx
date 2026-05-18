import { createContext, ReactNode, useState, useEffect } from 'react';
import i18n from '@/i18n/i18n';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';

/**
 * Language Context: Single source of truth for app language
 * Manages: language state, persistence, i18n sync
 * Provides: language, setLanguage
 */

interface LanguageContextType {
  language: 'he' | 'en';
  setLanguage: (lang: 'he' | 'en') => Promise<void>;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

/**
 * Synchronously read saved language from localStorage
 * Called during component initialization to prevent race condition
 * with useLanguagePreference's async effect
 */
function getSavedLanguage(): 'he' | 'en' {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userLanguagePreference');
      if (saved === 'he' || saved === 'en') {
        return saved;
      }
    }
  } catch (e) {
    // localStorage not available (SSR, private mode, etc.)
  }
  return 'he'; // Default fallback
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize state synchronously from localStorage (prevents race condition)
  const [language, setLanguageState] = useState<'he' | 'en'>(getSavedLanguage);
  const { userLanguage, setUserLanguage, isLoaded } = useLanguagePreference();

  // On mount: sync i18n with saved language immediately (prevents flicker)
  useEffect(() => {
    const savedLang = getSavedLanguage();
    const currentI18nLang = i18n.language as 'he' | 'en';
    if (currentI18nLang !== savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, []); // Empty deps: run once on mount only

  // When useLanguagePreference finishes loading, update if different from current state
  useEffect(() => {
    if (!isLoaded) return;
    
    if (userLanguage !== language) {
      setLanguageState(userLanguage);
      i18n.changeLanguage(userLanguage);
    }
  }, [isLoaded, userLanguage, language]);

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

  const setLanguage = async (lang: 'he' | 'en') => {
    setUserLanguage(lang); // Persist to localStorage first
    await i18n.changeLanguage(lang); // Wait for i18n to actually change
    setLanguageState(lang); // Update React state AFTER i18n is ready
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
