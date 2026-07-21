/**
 * U2b live Invoice4U adapter — HTTP client, clearing-log verification, env handling.
 *
 * fetch is stubbed with the recorded QA envelope shapes, so these need no network,
 * no credentials and no clearing terminal.
 *
 * Run: pnpm -C apps/web test invoice4u-live-adapter.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  invoice4uApiBase,
  invoice4uIsQaMode,
  invoice4uPost,
} from '../../../../supabase/functions/_shared/payments/invoice4u/client.ts';
import { verifyInvoice4uPaymentSucceeded } from '../../../../supabase/functions/_shared/payments/invoice4u/verify-callback.ts';

const QA_BASE = 'https://apiqa.invoice4u.co.il/Services/ApiService.svc';
const PROD_BASE = 'https://api.invoice4u.co.il/Services/ApiService.svc';

/** Just the parts of the fetch init we assert on — the DOM RequestInit type is not
 *  in this ESLint environment's globals. */
type FetchInit = { method?: string; body?: string };

/** Deno.env shim — these modules are edge-function code running under Deno. */
function stubDenoEnv(vars: Record<string, string>) {
  (globalThis as unknown as { Deno?: unknown }).Deno = {
    env: { get: (key: string) => vars[key] },
  };
}

/** Responses always arrive inside the .NET `{ d: ... }` envelope. */
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify({ d: payload }), { status });
}

beforeEach(() => {
  stubDenoEnv({ INVOICE4U_API_BASE: QA_BASE });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});

describe('invoice4u client — environment', () => {
  it('reads the base URL from INVOICE4U_API_BASE', () => {
    expect(invoice4uApiBase()).toBe(QA_BASE);
  });

  it('strips a trailing slash so method paths do not double up', () => {
    stubDenoEnv({ INVOICE4U_API_BASE: `${QA_BASE}/` });
    expect(invoice4uApiBase()).toBe(QA_BASE);
  });

  it('throws when unset rather than defaulting to production', () => {
    stubDenoEnv({});
    expect(() => invoice4uApiBase()).toThrow(/INVOICE4U_API_BASE is not set/);
  });

  // IsQaMode is derived from the base URL, never configured separately: a request
  // claiming QA while pointed at production would be a real-money accident.
  it('derives IsQaMode from the host', () => {
    expect(invoice4uIsQaMode(QA_BASE)).toBe(true);
    expect(invoice4uIsQaMode(PROD_BASE)).toBe(false);
  });
});

describe('invoice4u client — request and error handling', () => {
  it('posts JSON to {base}/{Method} and returns the unwrapped payload', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ Errors: [], ClearingRedirectUrl: 'https://pay' }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = await invoice4uPost('ProcessApiRequestV2', { request: { Sum: 1 } });

    expect(payload.ClearingRedirectUrl).toBe('https://pay');
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toBe(`${QA_BASE}/ProcessApiRequestV2`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ request: { Sum: 1 } });
  });

  // The trap this whole layer exists for: Invoice4U reports business failures as
  // HTTP 200 with a populated Errors[]. Anything keying off response.ok reads a
  // failed charge as a successful one.
  it('throws on HTTP 200 carrying Errors[]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          Errors: [{ Error: 'ApiTokenizationNotApprovedInClearingTerminal', ID: 309 }],
        }),
      ),
    );

    await expect(invoice4uPost('ProcessApiRequestV2', {})).rejects.toThrow(
      /ApiTokenizationNotApprovedInClearingTerminal \(309\)/,
    );
  });

  it('throws on a non-2xx transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway down', { status: 502 })));
    await expect(invoice4uPost('IsAuthenticated', {})).rejects.toThrow(/HTTP 502/);
  });

  it('throws on a non-JSON body instead of yielding undefined fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>error</html>', { status: 200 })));
    await expect(invoice4uPost('IsAuthenticated', {})).rejects.toThrow(/non-JSON body/);
  });

  it('surfaces a network error with the method name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    await expect(invoice4uPost('IsAuthenticated', {})).rejects.toThrow(
      /Invoice4U IsAuthenticated request failed: ECONNREFUSED/,
    );
  });
});

describe('callback verification', () => {
  const apiKey = 'test-api-key';

  function stubClearingLogs(rows: unknown[]) {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ Errors: [], ClearingLogs: rows })));
  }

  it('verifies a payment present in the clearing log', async () => {
    stubClearingLogs([{ PaymentId: 'pay-123', IsSuccess: true, Amount: 350 }]);

    const outcome = await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: 'pay-123' });

    expect(outcome.verified).toBe(true);
  });

  // The attack this closes: Invoice4U signs nothing, the callback URL is public, and a
  // customer sees their own OrderId. A forged Success=True must not settle a payment.
  it('rejects a payment that does not appear in the clearing log', async () => {
    stubClearingLogs([{ PaymentId: 'some-other-payment', IsSuccess: true, Amount: 350 }]);

    const outcome = await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: 'forged-id' });

    expect(outcome.verified).toBe(false);
    if (!outcome.verified) expect(outcome.reason).toMatch(/no successful clearing log/);
  });

  it('rejects when the provider-recorded amount differs from the expected amount', async () => {
    stubClearingLogs([{ PaymentId: 'pay-123', IsSuccess: true, Amount: 1 }]);

    const outcome = await verifyInvoice4uPaymentSucceeded({
      apiKey,
      paymentId: 'pay-123',
      expectedAmountMinor: 35000,
    });

    expect(outcome.verified).toBe(false);
    if (!outcome.verified) expect(outcome.reason).toMatch(/does not match expected/);
  });

  it('accepts a matching amount', async () => {
    stubClearingLogs([{ PaymentId: 'pay-123', IsSuccess: true, Amount: 350 }]);

    const outcome = await verifyInvoice4uPaymentSucceeded({
      apiKey,
      paymentId: 'pay-123',
      expectedAmountMinor: 35000,
    });

    expect(outcome.verified).toBe(true);
  });

  // Fail closed: an unverifiable payment stays pending and gets reconciled. The
  // alternative is granting access for money that may never have arrived.
  it('fails closed when the clearing-log lookup itself errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));

    const outcome = await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: 'pay-123' });

    expect(outcome.verified).toBe(false);
    if (!outcome.verified) expect(outcome.reason).toMatch(/clearing-log lookup failed/);
  });

  it('rejects a callback carrying no PaymentId without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: '' });

    expect(outcome.verified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The response envelope key is unconfirmed — no successful clearing has ever been
  // recorded, because no terminal existed when the U0 fixtures were captured.
  it('finds rows under any of the plausible envelope keys', async () => {
    for (const key of ['ClearingLogs', 'Logs', 'Results', 'Items']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse({ Errors: [], [key]: [{ PaymentId: 'pay-1', IsSuccess: true }] }),
        ),
      );
      const outcome = await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: 'pay-1' });
      expect(outcome.verified).toBe(true);
    }
  });

  it('searches a bounded recent window, since the API cannot filter by PaymentId', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ Errors: [], ClearingLogs: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const now = new Date('2026-07-21T12:00:00.000Z');
    await verifyInvoice4uPaymentSucceeded({ apiKey, paymentId: 'pay-1', now });

    const [, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    const body = JSON.parse(init.body as string);
    expect(body.token).toBe(apiKey);
    expect(body.searchParams.IsSuccess).toBe(true);
    expect(body.searchParams.ToDate).toBe('2026-07-21T12:00:00.000Z');
    expect(new Date(body.searchParams.FromDate).getTime()).toBeLessThan(now.getTime());
  });
});
