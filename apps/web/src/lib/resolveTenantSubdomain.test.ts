import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rememberCustomHostSubdomain,
  resolveTenantSite,
  resolveTenantSiteFromHostname,
  resolveTenantSubdomain,
  resolveTenantSubdomainFromHostname,
} from './resolveTenantSubdomain';

const ROOT = 'opalswift.com';

/**
 * Production builds have no dev fallback — `import.meta.env.DEV` is replaced with a
 * literal at build time, so it cannot be stubbed at runtime. Passing devFallback:null
 * to the pure resolver is what a production bundle actually does.
 */
const prod = (hostname: string) => resolveTenantSubdomainFromHostname(hostname, ROOT, null);

/** jsdom's location is read-only; replace it wholesale for the duration of a test. */
function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveTenantSubdomainFromHostname — production', () => {
  it('resolves a tenant subdomain', () => {
    expect(prod('creativeballet.opalswift.com')).toBe('creativeballet');
  });

  it('returns null on the apex — the marketing site is not a tenant', () => {
    expect(prod('opalswift.com')).toBeNull();
  });

  it('returns null on www', () => {
    expect(prod('www.opalswift.com')).toBeNull();
  });

  it('returns null on the tenant-less app shell', () => {
    expect(prod('app.opalswift.com')).toBeNull();
  });

  it.each(['api', 'admin', 'auth', 'cdn', 'static', 'assets', 'mail'])(
    'returns null for reserved subdomain %s',
    (reserved) => {
      expect(prod(`${reserved}.opalswift.com`)).toBeNull();
    },
  );

  it('returns null for a bare IP', () => {
    expect(prod('192.168.1.10')).toBeNull();
  });

  // The security property: a production bundle has no dev fallback, so an unmatched
  // host resolves to no tenant rather than silently serving one tenant's data.
  it('never falls back to a dev tenant when there is no fallback', () => {
    expect(prod('app.opalswift.com')).not.toBe('creativeballet');
    expect(prod('opalswift.com')).not.toBe('creativeballet');
  });
});

describe('resolveTenantSubdomainFromHostname — dev fallback', () => {
  const devFallback = (hostname: string) =>
    resolveTenantSubdomainFromHostname(hostname, 'localhost', 'creativeballet');

  it('uses the fallback on plain localhost', () => {
    expect(devFallback('localhost')).toBe('creativeballet');
  });

  it('prefers a real subdomain over the fallback', () => {
    expect(devFallback('therapist.localhost')).toBe('therapist');
  });

  it('still refuses reserved names, falling back instead', () => {
    expect(devFallback('www.localhost')).toBe('creativeballet');
  });
});

describe('resolveTenantSubdomain — window integration', () => {
  it('reads the hostname from window.location', () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', ROOT);
    setHostname('creativeballet.opalswift.com');
    expect(resolveTenantSubdomain()).toBe('creativeballet');
  });

  it('resolves reserved hosts without a tenant subdomain', () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', ROOT);
    vi.stubEnv('VITE_DEV_TENANT_SUBDOMAIN', '');
    setHostname('app.opalswift.com');
    expect(resolveTenantSubdomain()).toBeNull();
  });
});

describe('resolveTenantSiteFromHostname — custom domains', () => {
  const site = (hostname: string) => resolveTenantSiteFromHostname(hostname, ROOT, null);

  it('keeps resolving hosts under the root domain by subdomain', () => {
    expect(site('creativeballet.opalswift.com')).toEqual({ kind: 'subdomain', subdomain: 'creativeballet' });
    expect(site('opalswift.com')).toBeNull();
    expect(site('www.opalswift.com')).toBeNull();
    expect(site('app.opalswift.com')).toBeNull();
  });

  it('treats a host outside the root domain as a custom domain', () => {
    expect(site('app.creativeballetacademy.com')).toEqual({
      kind: 'custom',
      host: 'app.creativeballetacademy.com',
    });
    expect(site('App.CreativeBalletAcademy.com.')).toEqual({
      kind: 'custom',
      host: 'app.creativeballetacademy.com',
    });
  });

  it('never looks up a host under the root domain as a custom domain', () => {
    expect(site('evil.opalswift.com')).toEqual({ kind: 'subdomain', subdomain: 'evil' });
    expect(site('a.b.opalswift.com')?.kind).toBe('subdomain');
  });

  it('keeps IPs and local hosts out of the custom lookup', () => {
    expect(site('192.168.1.10')).toBeNull();
    expect(resolveTenantSiteFromHostname('therapist.localhost', 'localhost', null)).toEqual({
      kind: 'subdomain',
      subdomain: 'therapist',
    });
  });

  it('on a custom host, resolveTenantSubdomain returns the remembered tenant subdomain', () => {
    vi.stubEnv('VITE_APP_ROOT_DOMAIN', ROOT);
    setHostname('app.creativeballetacademy.com');
    expect(resolveTenantSubdomain()).toBeNull();
    rememberCustomHostSubdomain('app.creativeballetacademy.com', 'creativeballet');
    expect(resolveTenantSubdomain()).toBe('creativeballet');
    expect(resolveTenantSite()).toEqual({ kind: 'custom', host: 'app.creativeballetacademy.com' });
  });
});
