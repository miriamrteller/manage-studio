import { useState } from 'react';
import type { i18n as I18n, TFunction } from 'i18next';

/** Language of a downloaded CSV: headers, document types, reasons and method names. */
export type CsvLanguage = 'he' | 'en';

const STORAGE_KEY = 'opalswift.finance.csvLanguage';

export function csvLanguageFromApp(appLanguage: string | undefined): CsvLanguage {
  return appLanguage?.startsWith('he') ? 'he' : 'en';
}

/** A translator fixed to the CSV's language, whatever the app is showing. */
export function csvT(i18n: Pick<I18n, 'getFixedT'>, language: CsvLanguage): TFunction {
  return i18n.getFixedT(language);
}

/**
 * The CSV language, prefilled from the app language and editable. The last choice is
 * remembered in this browser only (a convenience; nothing depends on it).
 */
export function useCsvLanguage(appLanguage: string | undefined) {
  const [language, setLanguageState] = useState<CsvLanguage>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'he' || saved === 'en') return saved;
    } catch {
      // Storage unavailable: fall back to the app language.
    }
    return csvLanguageFromApp(appLanguage);
  });
  const setLanguage = (value: CsvLanguage) => {
    setLanguageState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore: the choice still applies to this page.
    }
  };
  return { language, setLanguage };
}
