import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE_NAMESPACE } from '@/i18n/verticalNamespace';

/**
 * Edge-function modules read `Deno.env` at import time. Vitest runs in Node —
 * provide a minimal Deno shim so payment/calendar imports don't throw.
 */
if (typeof globalThis.Deno === 'undefined') {
  globalThis.Deno = {
    env: {
      get(key: string): string | undefined {
        return process.env[key];
      },
    },
  } as typeof globalThis.Deno;
}

/**
 * Tenants without a verified branded domain send as <subdomain>@this.
 * resolveTenantSender() throws when it is unset — deliberately, so a missing
 * config can never become a guessed sender domain. Tests need it configured.
 */
process.env.PLATFORM_EMAIL_DOMAIN ??= 'opalswift.test';

/** Shared jsdom across files (e.g. --threads false) must not leak rendered trees. */
afterEach(() => {
  cleanup();
});

/**
 * Every test file starts with react-i18next's shared instance initialised, in English.
 * i18next and react-i18next live in node_modules, which Vitest does not reload between files, so
 * without this a file that renders translated components only passed when an earlier file had
 * initialised i18n (alone it rendered bare keys).
 *
 * Kept cheap: the instance is set up once per run (the English base file is read and parsed
 * once, synchronously) and later files only reset the language. A test that needs Hebrew or a
 * skin overlay imports '@/i18n/i18n' (the app's full setup) and sets the language itself.
 */
if (!i18next.isInitialized) {
  const en = JSON.parse(readFileSync(resolve(__dirname, '../i18n/en.json'), 'utf8'));
  i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { [BASE_NAMESPACE]: en } },
    ns: [BASE_NAMESPACE],
    defaultNS: BASE_NAMESPACE,
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
}
await i18next.changeLanguage('en');
