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
  return 'he';
}

function readStoredLanguage(): AppLanguage | null {
  const stored = localStorage.getItem('language');
  return stored === 'he' || stored === 'en' ? stored : null;
}

/**
 * Resolve UI language without flicker while auth profile is still loading.
 * Precedence: profile → (guest) localStorage → tenant default → 'he'.
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
    return readStoredLanguage() ?? 'he';
  }

  if (!isAuthenticated) {
    return readStoredLanguage() ?? resolveLanguage(null, tenantDefault);
  }

  return resolveLanguage(null, tenantDefault);
}

export function languageToDir(language: AppLanguage): 'rtl' | 'ltr' {
  return language === 'he' ? 'rtl' : 'ltr';
}
