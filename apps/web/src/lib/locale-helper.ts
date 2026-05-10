/**
 * Locale helpers — centralize fallback logic
 * Always ensures valid locale, defaults to Hebrew
 */

export function getLocale(tenantLocale?: string | null): string {
  const validLocales = ['he-IL', 'en-US'];
  return validLocales.includes(tenantLocale || '') ? (tenantLocale as string) : 'he-IL';
}
