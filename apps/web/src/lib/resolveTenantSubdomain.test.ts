import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTenantSubdomain } from './resolveTenantSubdomain';

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

describe('resolveTenantSubdomain', () => {
  describe('production hosts', () => {
    // VITE_APP_ROOT_DOMAIN is what tells the resolver where the apex is.
    const asProd = () => {
      vi.stubEnv('DEV', false);
      vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'opalswift.com');
      vi.stubEnv('VITE_DEV_TENANT_SUBDOMAIN', 'creativeballet');
    };

    it('resolves a tenant subdomain', () => {
      asProd();
      setHostname('creativeballet.opalswift.com');
      expect(resolveTenantSubdomain()).toBe('creativeballet');
    });

    it('returns null on the apex — the marketing site is not a tenant', () => {
      asProd();
      setHostname('opalswift.com');
      expect(resolveTenantSubdomain()).toBeNull();
    });

    it('returns null on www', () => {
      asProd();
      setHostname('www.opalswift.com');
      expect(resolveTenantSubdomain()).toBeNull();
    });

    it('returns null on the tenant-less app shell', () => {
      asProd();
      setHostname('app.opalswift.com');
      expect(resolveTenantSubdomain()).toBeNull();
    });

    it.each(['api', 'admin', 'auth', 'cdn', 'static'])(
      'returns null for reserved subdomain %s',
      (reserved) => {
        asProd();
        setHostname(`${reserved}.opalswift.com`);
        expect(resolveTenantSubdomain()).toBeNull();
      },
    );

    // The critical one: if the dev fallback leaked into a production build, every
    // unmatched host would silently serve one specific tenant's data.
    it('never falls back to VITE_DEV_TENANT_SUBDOMAIN in a production build', () => {
      asProd();
      setHostname('app.opalswift.com');
      expect(resolveTenantSubdomain()).not.toBe('creativeballet');
      expect(resolveTenantSubdomain()).toBeNull();
    });

    it('returns null for a bare IP', () => {
      asProd();
      setHostname('192.168.1.10');
      expect(resolveTenantSubdomain()).toBeNull();
    });
  });

  describe('local development', () => {
    const asDev = () => {
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_APP_ROOT_DOMAIN', 'localhost:5173');
      vi.stubEnv('VITE_DEV_TENANT_SUBDOMAIN', 'creativeballet');
    };

    it('resolves subdomain from a *.localhost host', () => {
      asDev();
      setHostname('therapist.localhost');
      expect(resolveTenantSubdomain()).toBe('therapist');
    });

    it('falls back to VITE_DEV_TENANT_SUBDOMAIN on plain localhost', () => {
      asDev();
      setHostname('localhost');
      expect(resolveTenantSubdomain()).toBe('creativeballet');
    });
  });
});
