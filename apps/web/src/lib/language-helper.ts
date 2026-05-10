/**
 * Language & Locale Helpers
 * Compute derived values (dir, locale) from language + country sources of truth
 * Supports user overrides of tenant defaults
 */

/**
 * Resolve effective language from user override or tenant default
 */
export function resolveLanguage(
  userLanguage: string | null | undefined,
  tenantLanguage: string
): 'he' | 'en' {
  if (userLanguage && ['he', 'en'].includes(userLanguage)) {
    return userLanguage as 'he' | 'en';
  }
  return (tenantLanguage as 'he' | 'en') || 'he';
}

/**
 * Resolve effective country from user override or tenant default
 */
export function resolveCountry(
  userCountry: string | null | undefined,
  tenantCountry: string
): 'IL' | 'US' {
  if (userCountry && ['IL', 'US'].includes(userCountry)) {
    return userCountry as 'IL' | 'US';
  }
  return (tenantCountry as 'IL' | 'US') || 'IL';
}

/**
 * Compute text direction (RTL/LTR) from language
 * Used for HTML dir attribute
 */
export function getDir(language: 'he' | 'en'): 'rtl' | 'ltr' {
  return language === 'he' ? 'rtl' : 'ltr';
}

/**
 * Compute locale string from language + country
 * Used for Intl APIs (formatCurrency, formatDate, etc.)
 * Examples: 'he-IL', 'en-US', 'en-IL'
 */
export function getLocale(language: 'he' | 'en', country: 'IL' | 'US'): string {
  return `${language}-${country}`;
}

/**
 * Compute all derived language settings in one call
 * Returns: { language, country, dir, locale }
 */
export function resolveLanguageSettings(
  userLanguage: string | null | undefined,
  userCountry: string | null | undefined,
  tenantLanguage: string,
  tenantCountry: string
) {
  const language = resolveLanguage(userLanguage, tenantLanguage);
  const country = resolveCountry(userCountry, tenantCountry);
  return {
    language,
    country,
    dir: getDir(language),
    locale: getLocale(language, country),
  };
}

/**
 * Format a date in the given locale
 * Falls back to en-US if locale is invalid
 */
export function formatDate(
  date: Date | string,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(
      typeof date === 'string' ? new Date(date) : date
    );
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(
      typeof date === 'string' ? new Date(date) : date
    );
  }
}
