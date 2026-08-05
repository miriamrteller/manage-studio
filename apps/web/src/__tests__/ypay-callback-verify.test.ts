/**
 * YPay callback parsing + server-side verification (the security-relevant path).
 *
 * The callback is unsigned, so a `success=true` claim is confirmed against
 * getTransactionsInfo before it settles. These tests pin parse behaviour and the
 * fail-closed verification.
 *
 * Run: pnpm -C apps/web test ypay-callback-verify.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseYpayCallback,
  peekYpayChargeIdentifier,
} from '../../../../supabase/functions/_shared/payments/ypay/callback.ts';
import { verifyYpayTransaction } from '../../../../supabase/functions/_shared/payments/ypay/verify-callback.ts';

const META = {
  tenant_id: '00000000-0000-0000-0000-000000000001',
  engagement_id: '00000000-0000-0000-0000-000000000002',
  billing_account_id: '00000000-0000-0000-0000-000000000003',
  charge_type: 'initial' as const,
  total_amount_minor: '35000',
};

function stubDenoEnv(vars: Record<string, string>) {
  (globalThis as unknown as { Deno?: unknown }).Deno = { env: { get: (k: string) => vars[k] } };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

/**
 * Verification makes TWO calls: accessToken, then getTransactionsInfo. Route by URL
 * so the token step always succeeds and the assertion targets the lookup.
 */
function stubYpayFetch(transactionsPayload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/accessToken')) {
        return jsonResponse({ access_token: 'tok', lifetime: 3_600_000 });
      }
      return jsonResponse(transactionsPayload);
    }),
  );
}

/** Supabase stub: credentials RPC + token cache, so verify can reach getTransactionsInfo. */
function makeVerifyService() {
  return {
    rpc: async () => ({
      data: [{ payment_provider_public_key: 'cid', payment_provider_secret_key: 'secret' }],
      error: null,
    }),
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
      upsert: async () => ({ error: null }),
    }),
  } as never;
}

beforeEach(() => stubDenoEnv({ YPAY_API_BASE: 'https://ypay.co.il/api/v1' }));
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

describe('parseYpayCallback', () => {
  it('parses a JSON success callback', () => {
    const body = JSON.stringify({
      success: 'true',
      transactionId: '7886',
      chargeIdentifier: 'charge-1',
      sum: '350',
      document_id: '900061',
      url: 'https://ypay.co.il/doc.pdf',
    });
    const parsed = parseYpayCallback(body, 'charge-1', META);

    expect(parsed.event.type).toBe('payment.succeeded');
    expect(parsed.transactionId).toBe('7886');
    expect(parsed.event.amountMinor).toBe(35000);
    expect(parsed.document?.externalDocumentId).toBe('900061');
  });

  it('parses a form-encoded callback', () => {
    const parsed = parseYpayCallback(
      'success=true&transactionId=7886&chargeIdentifier=charge-1&sum=350',
      'charge-1',
      META,
    );
    expect(parsed.event.type).toBe('payment.succeeded');
    expect(parsed.transactionId).toBe('7886');
  });

  it('marks a failure callback and keeps no document', () => {
    const parsed = parseYpayCallback(
      JSON.stringify({ success: 'false', transactionId: '0' }),
      'charge-1',
      META,
    );
    expect(parsed.event.type).toBe('payment.failed');
    expect(parsed.transactionId).toBeNull();
    expect(parsed.document).toBeNull();
  });

  it('rejects a success callback with no transactionId', () => {
    expect(() =>
      parseYpayCallback(JSON.stringify({ success: 'true', transactionId: '0' }), 'charge-1', META),
    ).toThrow(/missing transactionId/);
  });

  it('peeks the chargeIdentifier without full parsing', () => {
    expect(peekYpayChargeIdentifier('chargeIdentifier=abc&success=true')).toBe('abc');
    expect(peekYpayChargeIdentifier('garbage')).toBeUndefined();
  });
});

describe('verifyYpayTransaction — fail closed', () => {
  const base = { service: makeVerifyService(), tenantId: META.tenant_id };

  it('verifies a settled transaction', async () => {
    stubYpayFetch({
      responseCode: 1,
      transactionsInfo: [{ cashierid: '7886', transferstatus: 'S', totalamount: '350' }],
    });
    const out = await verifyYpayTransaction({ ...base, transactionId: '7886' });
    expect(out.verified).toBe(true);
  });

  // A forged callback names a transaction that isn't really settled → must not settle.
  it('rejects a transaction not returned by getTransactionsInfo', async () => {
    stubYpayFetch({ responseCode: 1, transactionsInfo: [] });
    const out = await verifyYpayTransaction({ ...base, transactionId: 'forged' });
    expect(out.verified).toBe(false);
    if (!out.verified) expect(out.reason).toMatch(/no transaction/);
  });

  it('rejects a non-successful transferstatus', async () => {
    stubYpayFetch({
      responseCode: 1,
      transactionsInfo: [{ cashierid: '7886', transferstatus: 'F', providercashierstatus: '999' }],
    });
    const out = await verifyYpayTransaction({ ...base, transactionId: '7886' });
    expect(out.verified).toBe(false);
  });

  it('rejects an amount mismatch', async () => {
    stubYpayFetch({
      responseCode: 1,
      transactionsInfo: [{ cashierid: '7886', transferstatus: 'S', totalamount: '1' }],
    });
    const out = await verifyYpayTransaction({ ...base, transactionId: '7886', expectedAmountMinor: 35000 });
    expect(out.verified).toBe(false);
    if (!out.verified) expect(out.reason).toMatch(/does not match expected/);
  });

  it('fails closed when getTransactionsInfo itself errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/accessToken')) {
          return jsonResponse({ access_token: 'tok', lifetime: 3_600_000 });
        }
        throw new Error('timeout');
      }),
    );
    const out = await verifyYpayTransaction({ ...base, transactionId: '7886' });
    expect(out.verified).toBe(false);
    if (!out.verified) expect(out.reason).toMatch(/getTransactionsInfo failed/);
  });

  it('rejects an empty transactionId without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await verifyYpayTransaction({ ...base, transactionId: '' });
    expect(out.verified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
