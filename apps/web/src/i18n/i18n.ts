import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import heLang from './he.json'
import enLang from './en.json'
import photographerHe from './verticals/photographer.he.json'
import photographerEn from './verticals/photographer.en.json'
import danceHe from './verticals/dance.he.json'
import danceEn from './verticals/dance.en.json'
import noFamiliesHe from './verticals/no-families.he.json'
import noFamiliesEn from './verticals/no-families.en.json'
import {
  BASE_NAMESPACE,
  DANCE_NAMESPACE,
  NO_FAMILIES_NAMESPACE,
  PHOTOGRAPHER_NAMESPACE,
  withoutFamiliesNamespace,
} from './verticalNamespace'

type Bundle = Record<string, unknown>

const isBundle = (value: unknown): value is Bundle =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Deep merge: keys in `top` win over `under`. */
function layer(top: Bundle, under: Bundle): Bundle {
  const out: Bundle = { ...under }
  for (const [key, value] of Object.entries(top)) {
    const below = out[key]
    out[key] = isBundle(value) && isBundle(below) ? layer(value, below) : value
  }
  return out
}

function bundlesFor(base: Bundle, photographer: Bundle, dance: Bundle, noFamilies: Bundle) {
  return {
    [BASE_NAMESPACE]: base,
    [PHOTOGRAPHER_NAMESPACE]: photographer,
    [DANCE_NAMESPACE]: dance,
    // Family accounts off: the no-families wording, under the vertical's own wording.
    [NO_FAMILIES_NAMESPACE]: noFamilies,
    [withoutFamiliesNamespace(PHOTOGRAPHER_NAMESPACE)]: layer(photographer, noFamilies),
    [withoutFamiliesNamespace(DANCE_NAMESPACE)]: layer(dance, noFamilies),
  }
}

const heBundles = bundlesFor(heLang, photographerHe, danceHe, noFamiliesHe)
const enBundles = bundlesFor(enLang, photographerEn, danceEn, noFamiliesEn)

// Note: FullCalendar locales are registered in plugins/calendar configuration

i18n
  .use(initReactI18next)
  .init({
    resources: {
      he: heBundles,
      en: enBundles,
    },
    fallbackLng: 'en',
    ns: Object.keys(enBundles),
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
