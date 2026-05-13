import { useEffect } from 'react';
import { useTenant } from './useTenant';

/**
 * Single source of truth for app language and direction
 * Sets HTML element lang and dir attributes based on tenant language_default
 * Direction is computed from language only: he → rtl, en → ltr
 *
 * Usage: Call once at App root
 * Example:
 *   function App() {
 *     useLanguage();
 *     return <AppContent />;
 *   }
 *
 * How it works:
 * 1. Watches tenant.language_default (fetched from Supabase)
 * 2. Computes direction: language === 'he' ? 'rtl' : 'ltr'
 * 3. Updates document.documentElement.lang and document.documentElement.dir
 * 4. All components inherit direction via CSS logical properties
 * 5. Children components should NEVER set dir or pass it as props
 */
export function useLanguage(): void {
  const tenant = useTenant();

  useEffect(() => {
    const language = tenant?.language_default || 'en';
    const direction = language === 'he' ? 'rtl' : 'ltr';

    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [tenant?.language_default]);
}
