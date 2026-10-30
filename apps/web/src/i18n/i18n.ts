import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import heLocale from 'date-fns/locale/he'
import heLang from './he.json'
import enLang from './en.json'
import photographerHe from './verticals/photographer.he.json'
import photographerEn from './verticals/photographer.en.json'
import { BASE_NAMESPACE, PHOTOGRAPHER_NAMESPACE } from './verticalNamespace'

// Note: FullCalendar locales are registered in plugins/calendar configuration
// date-fns Hebrew locale is imported for use in date formatting utilities
heLocale

i18n
  .use(initReactI18next)
  .init({
    resources: {
      he: { [BASE_NAMESPACE]: heLang, [PHOTOGRAPHER_NAMESPACE]: photographerHe },
      en: { [BASE_NAMESPACE]: enLang, [PHOTOGRAPHER_NAMESPACE]: photographerEn },
    },
    fallbackLng: 'en',
    ns: [BASE_NAMESPACE, PHOTOGRAPHER_NAMESPACE],
    defaultNS: BASE_NAMESPACE,
    // Vertical overlays (e.g. 'photographer') hold only the keys whose wording
    // differs; anything they don't define resolves from the base namespace.
    // Only VerticalI18nProvider switches a subtree to an overlay namespace.
    fallbackNS: BASE_NAMESPACE,
    interpolation: {
      escapeValue: false,
    },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (_lngs, _ns, key) => {
          console.warn(`[i18n] missing key: ${key}`);
        }
      : undefined,
  })

export default i18n
