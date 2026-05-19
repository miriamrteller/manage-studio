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

export function languageToDir(language: AppLanguage): 'rtl' | 'ltr' {
  return language === 'he' ? 'rtl' : 'ltr';
}
