/**
 * Tenant links must be derived from tenants.subdomain, never from APP_URL.
 *
 * APP_URL is a single platform-wide value. Six tenant-facing links were once
 * built from it, which meant a second studio's parents would receive emails
 * pointing at the first studio's site. These tests keep that from coming back:
 * the source assertion at the bottom fails if any new parent-facing link starts
 * using APP_URL again.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  tenantBaseUrl,
  appRootDomain,
  platformAppUrl,
} from '../../../../supabase/functions/_shared/tenant-url.ts';

const FUNCTIONS_DIR = resolve(__dirname, '../../../../supabase/functions');

const OLD = { root: process.env.APP_ROOT_DOMAIN, app: process.env.APP_URL };
beforeAll(() => {
  process.env.APP_ROOT_DOMAIN = 'opalswift.com';
  process.env.APP_URL = 'https://app.opalswift.com';
});
afterAll(() => {
  process.env.APP_ROOT_DOMAIN = OLD.root;
  process.env.APP_URL = OLD.app;
});

describe('tenant base URL', () => {
  it('builds a per-tenant origin from the subdomain', () => {
    expect(tenantBaseUrl('creativeballet')).toBe('https://creativeballet.opalswift.com');
    expect(tenantBaseUrl('belladance')).toBe('https://belladance.opalswift.com');
  });

  it('gives different tenants different origins — the whole point', () => {
    expect(tenantBaseUrl('creativeballet')).not.toBe(tenantBaseUrl('belladance'));
  });

  it('refuses to build a link without a subdomain', () => {
    expect(() => tenantBaseUrl('')).toThrow();
    expect(() => tenantBaseUrl(null)).toThrow();
  });

  it('derives the root domain from a legacy tenant-specific APP_URL', () => {
    delete process.env.APP_ROOT_DOMAIN;
    process.env.APP_URL = 'https://creativeballet.opalswift.com';
    expect(appRootDomain()).toBe('opalswift.com');
    process.env.APP_ROOT_DOMAIN = 'opalswift.com';
    process.env.APP_URL = 'https://app.opalswift.com';
  });
});

describe('platformAppUrl', () => {
  it('rejects a wildcard — it is concatenated with a path, and OAuth needs an exact match', () => {
    process.env.APP_URL = 'https://*.opalswift.com';
    expect(() => platformAppUrl()).toThrow(/wildcard/i);
    process.env.APP_URL = 'https://app.opalswift.com';
  });

  it('throws when unset rather than producing "undefined/path"', () => {
    delete process.env.APP_URL;
    expect(() => platformAppUrl()).toThrow(/not configured/i);
    process.env.APP_URL = 'https://app.opalswift.com';
  });
});

describe('APP_URL is confined to OAuth redirect URIs', () => {
  function edgeFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'email-dist' || name === '__tests__') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) edgeFiles(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  it('no Edge Function builds a non-OAuth link from APP_URL', () => {
    const offenders: string[] = [];
    for (const file of edgeFiles(FUNCTIONS_DIR)) {
      // Comments legitimately quote `${APP_URL}/...` while explaining the rule.
      // Scan code only — otherwise the documentation trips its own guard.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(/\$\{APP_URL\}([^\s`"']*)/g)) {
        const path = m[1];
        // The Google redirect_uri is the one legitimate use.
        if (path.includes('/admin/setup/integrations/google/callback')) continue;
        offenders.push(`${file.replace(FUNCTIONS_DIR, '')} → \${APP_URL}${path}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
