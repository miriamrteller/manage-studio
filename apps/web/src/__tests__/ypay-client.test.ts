/**
 * YPay client: base URL, token cache (the error-3001 constraint), responseCode
 * handling, and the accessToken credential check. fetch + Supabase are stubbed, so
 * no network and no credentials are needed.
 *
 * Run: pnpm -C apps/web test ypay-client.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getYpayAccessToken,
  ypayApiBase,
  ypayPost,
  ypayVerifyAccessToken,
} from '../../../../supabase/functions/_shared/payments/ypay/client.ts';

const DEFAULT_BASE = 'https://ypay.co.il/api/v1';

function stubDenoEnv(vars: Record<string, string>) {
  (globalThis as unknown as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => vars[key] },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

/** Minimal Supabase stub for the token cache table. */
function makeTokenCacheService(cached: { token: string; expires_at: string } | null) {
  const upserts: Record<string, unknown>[] = [];
  const service = {
    from(table: string) {
      if (table !== 'payment_provider_token_cache') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: cached, error: null }) }),
          }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row);
          return { error: null };
        },
      };
    },
  } as never;
  return { service, upserts };
}

beforeEach(() => stubDenoEnv({}));

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

describe('ypay client — base URL', () => {
  it('defaults to the production base when unset', () => {
    expect(ypayApiBase()).toBe(DEFAULT_BASE);
  });

  it('honours YPAY_API_BASE and strips a trailing slash', () => {
    stubDenoEnv({ YPAY_API_BASE: 'https://sandbox.example/api/v1/' });
    expect(ypayApiBase()).toBe('https://sandbox.example/api/v1');
  });
});

describe('ypay client — responseCode handling', () => {
  const token = 'tok';

  it('returns the payload when responseCode is 1', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ responseCode: 1, url: 'https://pay' })));
    const out = await ypayPost('payment', token, {});
    expect(out.url).toBe('https://pay');
  });

  it('throws with the mapped message on a non-1 responseCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ responseCode: 4001 })));
    await expect(ypayPost('payment', token, {})).rejects.toThrow(/unique charge identifier/i);
  });

  it('throws on a non-2xx transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 502 })));
    await expect(ypayPost('payment', token, {})).rejects.toThrow(/HTTP 502/);
  });

  it('surfaces a network error with the path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(ypayPost('payment', token, {})).rejects.toThrow(/YPay payment request failed: ECONNREFUSED/);
  });
});

describe('ypay client — token cache (error 3001 constraint)', () => {
  const creds = { clientId: 'cid', clientSecret: 'secret' };

  it('reuses a cached, unexpired token without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { service } = makeTokenCacheService({
      token: 'cached-token',
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });

    const token = await getYpayAccessToken(service, 'tenant-1', creds);

    expect(token).toBe('cached-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints and caches a fresh token when the cache is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ access_token: 'new-token', lifetime: 3_600_000 })),
    );
    const { service, upserts } = makeTokenCacheService(null);

    const token = await getYpayAccessToken(service, 'tenant-1', creds);

    expect(token).toBe('new-token');
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ provider: 'ypay', token: 'new-token' });
  });

  it('re-mints when the cached token is within the expiry skew', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ access_token: 'fresh', lifetime: 3_600_000 })));
    const { service } = makeTokenCacheService({
      token: 'stale',
      expires_at: new Date(Date.now() + 10_000).toISOString(), // inside the 60s skew
    });

    const token = await getYpayAccessToken(service, 'tenant-1', creds);
    expect(token).toBe('fresh');
  });
});

describe('ypay client — credential check', () => {
  const creds = { clientId: 'cid', clientSecret: 'secret' };

  it('passes when accessToken returns a token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ access_token: 'abc' })));
    await expect(ypayVerifyAccessToken(creds)).resolves.toBeUndefined();
  });

  // 3001 = "already an active token": the credentials are valid, a token just exists.
  it('treats error 3001 as a valid credential', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ responseCode: 3001 })));
    await expect(ypayVerifyAccessToken(creds)).resolves.toBeUndefined();
  });

  it('fails on bad credentials (2003)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ responseCode: 2003 })));
    await expect(ypayVerifyAccessToken(creds)).rejects.toThrow(/client id or client secret/i);
  });
});
