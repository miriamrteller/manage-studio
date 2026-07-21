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

/** Shared jsdom across files (e.g. --threads false) must not leak rendered trees. */
afterEach(() => {
  cleanup();
});
