import { useContext, useEffect } from 'react';
import { LanguageContext } from '@/contexts/LanguageContext';

/**
 * useLanguage: Access language state from Context
 * Syncs HTML dir/lang attributes with language changes
 * 
 * Returns: { language, setLanguage }
 * 
 * Usage:
 *   const { language, setLanguage } = useLanguage();
 *   setLanguage('he'); // Changes language and syncs HTML
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }

  const { language, setLanguage } = context;

  // Sync HTML dir/lang with language changes
  useEffect(() => {
    const direction = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language]);

  return { language, setLanguage };
}
