import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import i18n from '@/i18n/i18n';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { resolveEffectiveLanguage, type AppLanguage } from '@/lib/resolve-language';
import { DocumentLanguageSync } from '@/components/DocumentLanguageSync';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { session } = useAuthSession();
  const { user, isProfileChecked } = useCurrentUser();

  const effectiveLanguage = useMemo(
    () =>
      resolveEffectiveLanguage({
        profileLanguage: user?.language,
        tenantDefault: tenant?.language_default,
        isAuthenticated: Boolean(session?.user),
        isProfileChecked,
      }),
    [user?.language, session?.user, tenant?.language_default, isProfileChecked],
  );

  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem('language');
    if (stored === 'he' || stored === 'en') return stored;
    return 'he';
  });

  useEffect(() => {
    setLanguageState(effectiveLanguage);
    localStorage.setItem('language', effectiveLanguage);
  }, [effectiveLanguage]);

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

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
