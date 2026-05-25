import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import i18n from '@/i18n/i18n';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { resolveLanguage, type AppLanguage } from '@/lib/resolve-language';
import { DocumentLanguageSync } from '@/components/DocumentLanguageSync';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { user } = useCurrentUser();


  const defaultLanguage = useMemo(
    () => resolveLanguage(user?.language, tenant?.language_default),
    [user?.language, tenant?.language_default],
  );

  const [language, setLanguageState] = useState<AppLanguage>(() => {
    if (user?.language) return user.language;
    const stored = localStorage.getItem('language');
    if (stored) return stored as AppLanguage;
    return defaultLanguage;
  });


  // When user or tenant changes, update language if user has a preference
  useEffect(() => {
    if (user?.language) {
      setLanguageState(user.language);
      localStorage.setItem('language', user.language);
    }
    // If no user, don't override current language
  }, [user?.language, tenant?.language_default]);


  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);


  // Only update language if user explicitly changes it
  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      setLanguageState(lang);
      await i18n.changeLanguage(lang);

      localStorage.setItem('language', lang);

      if (user) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ language: lang })
          .eq('id', user.id);

        if (error) {
          console.warn('Failed to persist language preference:', error.message);
        } else {
          await queryClient.invalidateQueries({ queryKey: ['currentUser'] });
        }
      }
    },
    [user],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <DocumentLanguageSync />
      {children}
    </LanguageContext.Provider>
  );
}
