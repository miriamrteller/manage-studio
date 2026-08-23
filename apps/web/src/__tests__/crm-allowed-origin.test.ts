/**
 * CORS origin policy for the CRM endpoints (self-onboard rule: any tenant
 * subdomain of the platform root domain is allowed with zero per-tenant
 * config; everything else needs the explicit configured origin).
 */
import { describe, expect, it } from 'vitest';

import { isAllowedCrmOrigin } from '../../../../supabase/functions/_shared/crm-contract/allowed-origin.ts';

const policy = { rootDomain: 'opalswift.com', configuredOrigin: 'https://crm.example.com' };

describe('isAllowedCrmOrigin', () => {
  it.each([
    'http://localhost:8081',
    'https://crm.example.com',
    'https://crm.example.com/', // trailing slash normalised
    'https://creativeballet.opalswift.com',
    'https://new-tenant-42.opalswift.com', // self-onboard: no config needed
  ])('allows %s', (origin) => {
    expect(isAllowedCrmOrigin(origin, policy)).toBe(true);
  });

  it.each([
    null,
    '',
    'https://evil.example.com',
    'http://creativeballet.opalswift.com', // https only for tenant portals
    'https://creativeballet.opalswift.com:8443', // no non-default ports
    'https://evilopalswift.com', // suffix trick
    'https://opalswift.com.evil.example', // embedded-domain trick
    'https://a.b.opalswift.com', // one label only
    'https://opalswift.com', // apex is not a tenant portal
    'http://localhost:3000',
  ])('rejects %s', (origin) => {
    expect(isAllowedCrmOrigin(origin as string | null, policy)).toBe(false);
  });

  it('with no root domain configured, only localhost and the configured origin pass', () => {
    const bare = { rootDomain: null, configuredOrigin: null };
    expect(isAllowedCrmOrigin('https://creativeballet.opalswift.com', bare)).toBe(false);
    expect(isAllowedCrmOrigin('http://localhost:8081', bare)).toBe(true);
  });
});
