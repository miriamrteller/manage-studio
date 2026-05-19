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
  const [guestOverride, setGuestOverride] = useState<AppLanguage | null>(null);

  const resolvedFromSources = useMemo(
    () => resolveLanguage(user?.language, tenant?.language_default),
    [user?.language, tenant?.language_default],
  );

  const language = user ? resolvedFromSources : (guestOverride ?? resolvedFromSources);

  useEffect(() => {
    if (user) {
      setGuestOverride(null);
    }
  }, [user]);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  const setLanguage = useCallback(
    async (lang: AppLanguage) => {
      await i18n.changeLanguage(lang);

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
      } else {
        setGuestOverride(lang);
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
