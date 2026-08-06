import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
