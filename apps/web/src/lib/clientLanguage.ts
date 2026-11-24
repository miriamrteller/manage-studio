// The default i18next instance (set up in @/i18n/i18n). Imported directly so this helper
// does not pull in react-i18next, which many tests mock without initReactI18next.
import i18n from 'i18next';
import type { AppLanguage } from '@/lib/resolve-language';

/**
 * The language the visitor is using OpalSwift in right now. Sent with a booking,
 * enrolment, order or form so the studio's emails to that client go out in the
 * same language (saved on the client record).
 */
export function currentClientLanguage(): AppLanguage {
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? '').slice(0, 2);
  return lang === 'en' ? 'en' : 'he';
}
