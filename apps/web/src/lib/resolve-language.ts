export type AppLanguage = 'he' | 'en';

export function resolveLanguage(
  profileLanguage: AppLanguage | null | undefined,
  tenantDefault: AppLanguage | null | undefined,
): AppLanguage {
  if (profileLanguage === 'he' || profileLanguage === 'en') {
    return profileLanguage;
  }
  if (tenantDefault === 'he' || tenantDefault === 'en') {
    return tenantDefault;
  }
  return 'en';
}

function readStoredLanguage(): AppLanguage | null {
  const stored = localStorage.getItem('language');
  return stored === 'he' || stored === 'en' ? stored : null;
}

/**
 * Resolve UI language without flicker while auth profile is still loading.
 * Precedence: profile → (guest) localStorage → tenant default → 'en'.
 */
export function resolveEffectiveLanguage(options: {
  profileLanguage: AppLanguage | null | undefined;
  tenantDefault: AppLanguage | null | undefined;
  isAuthenticated: boolean;
  isProfileChecked: boolean;
}): AppLanguage {
  const { profileLanguage, tenantDefault, isAuthenticated, isProfileChecked } = options;

  if (profileLanguage === 'he' || profileLanguage === 'en') {
    return profileLanguage;
  }

  if (isAuthenticated && !isProfileChecked) {
    return readStoredLanguage() ?? 'en';
  }

  if (!isAuthenticated) {
    return readStoredLanguage() ?? resolveLanguage(null, tenantDefault);
  }

  return resolveLanguage(null, tenantDefault);
}

export function languageToDir(language: AppLanguage): 'rtl' | 'ltr' {
  return language === 'he' ? 'rtl' : 'ltr';
}

/**
 * A `?lang=en|he` link (e.g. from a studio's own website) picks the visitor's
 * language. Returns the language when the param is valid, plus the same address
 * without the param (so it can be dropped from the address bar). An invalid
 * value is ignored but still dropped. Null `cleaned` means no `lang` param.
 */
export function readLangParam(href: string): { lang: AppLanguage | null; cleaned: string | null } {
  const url = new URL(href, 'http://localhost');
  if (!url.searchParams.has('lang')) return { lang: null, cleaned: null };
  const value = url.searchParams.get('lang')?.trim().toLowerCase();
  url.searchParams.delete('lang');
  return {
    lang: value === 'he' || value === 'en' ? value : null,
    cleaned: `${url.pathname}${url.search}${url.hash}`,
  };
}

/**
 * Honour `?lang=en|he` once on load: store it as the visitor's choice (same as the
 * language toggle) and drop it from the address. A signed-in user's saved profile
 * language still wins after sign-in, because hydration prefers the profile.
 */
export function consumeLangParam(): AppLanguage | null {
  try {
    const { lang, cleaned } = readLangParam(window.location.href);
    if (cleaned === null) return null;
    if (lang) localStorage.setItem('language', lang);
    window.history.replaceState(window.history.state, '', cleaned);
    return lang;
  } catch {
    return null;
  }
}
