import { useState, useEffect } from 'react';

/**
 * Manages user language preference (overrides tenant default)
 * Persists to localStorage so it survives page reloads
 * 
 * Returns: { userLanguage, toggleLanguage }
 * - userLanguage: 'he' | 'en' (defaults to 'he' on first load)
 * - toggleLanguage: () => void (cycles between: he ↔ en)
 */
export function useLanguagePreference() {
  const [userLanguage, setUserLanguage] = useState<'he' | 'en'>('he');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('userLanguagePreference');
    if (saved === 'he' || saved === 'en') {
      setUserLanguage(saved);
    } else {
      // Default to Hebrew on first load
      setUserLanguage('he');
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when changed
  useEffect(() => {
    if (!isLoaded) return;
    if (userLanguage) {
      localStorage.setItem('userLanguagePreference', userLanguage);
    } else {
      localStorage.removeItem('userLanguagePreference');
    }
  }, [userLanguage, isLoaded]);

  const toggleLanguage = () => {
    setUserLanguage((prev) => {
      if (prev === 'he') return 'en';
      return 'he'; // Default to he
    });
  };

  return { userLanguage, toggleLanguage, isLoaded };
}
