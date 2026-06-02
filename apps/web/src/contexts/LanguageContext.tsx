import { createContext, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n/i18n';
import { useAuthSession } from '@/hooks/useAuth';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { resolveEffectiveLanguage, type AppLanguage } from '@/lib/resolve-language';
import { DocumentLanguageSync } from '@/components/DocumentLanguageSync';
import type { UserProfile } from '@/types/auth';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

function readStoredLanguage(): AppLanguage | null {
  const stored = localStorage.getItem('language');
  return stored === 'he' || stored === 'en' ? stored : null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const tenant = useTenant();
  const { session } = useAuthSession();
  const { user, isProfileChecked, isLoading: profileLoading } = useCurrentUser();

  const [language, setLanguageState] = useState<AppLanguage>(
    () => readStoredLanguage() ?? 'he',
  );

  // Hydrate from profile/tenant once per auth session — not on every profile refetch.
  const hydratedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isProfileChecked) return;
    if (session?.user && profileLoading) return;

    const sessionKey = session?.user?.id ?? 'guest';
    if (hydratedSessionRef.current === sessionKey) return;
    hydratedSessionRef.current = sessionKey;

    const resolved = resolveEffectiveLanguage({
      profileLanguage: user?.language,
      tenantDefault: tenant?.language_default,
      isAuthenticated: Boolean(session?.user),
      isProfileChecked,
    });

    setLanguageState(resolved);
    localStorage.setItem('language', resolved);
  }, [
    isProfileChecked,
    profileLoading,
    session?.user,
    user?.language,
    tenant?.language_default,
  ]);

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

      const userId = session?.user?.id;
      if (user && userId) {
        queryClient.setQueryData<UserProfile | null>(['currentUser', userId], (old) =>
          old ? { ...old, language: lang } : old,
        );

        const { error } = await supabase
          .from('user_profiles')
          .update({ language: lang })
          .eq('id', user.id);

        if (error) {
          console.warn('Failed to persist language preference:', error.message);
        }
      }
    },
    [user, session?.user?.id],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      <DocumentLanguageSync />
      {children}
    </LanguageContext.Provider>
  );
}
