import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import heLocale from 'date-fns/locale/he'
import heLang from './he.json'
import enLang from './en.json'

// Note: FullCalendar locales are registered in plugins/calendar configuration
// date-fns Hebrew locale is imported for use in date formatting utilities
heLocale

i18n
  .use(initReactI18next)
  .init({
    resources: {
      he: { translation: heLang },
      en: { translation: enLang },
    },
    fallbackLng: 'en',
    defaultNS: 'translation',
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
