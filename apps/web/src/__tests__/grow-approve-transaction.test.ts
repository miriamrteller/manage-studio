/**
 * G4a: constructEvent always calls Grow's Approve Transaction on a successful notify.
 * Run: pnpm -C apps/web test grow-approve-transaction.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import paymentNotify from './fixtures/grow-payment-notify.json';

function makeService() {
  // Terminal rows returned per table by single()/maybeSingle().
  const singleRowByTable: Record<string, unknown> = {
    tenants: { payment_provider_account_id: 'grow_user_1' },
  };
  // maybeSingle() lookups (replay check, existing card token) default to null.
  const maybeSingleRowByTable: Record<string, unknown> = {
    payments: null,
    payment_method_tokens: null,
  };

  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      single: async () => ({ data: singleRowByTable[table] ?? null, error: null }),
      maybeSingle: async () => ({ data: maybeSingleRowByTable[table] ?? null, error: null }),
      insert: async () => ({ data: null, error: null }),
    };
    return builder;
  };

  return {
    rpc: async () => ({
      data: [
        {
          payment_provider_public_key: 'page_code_123',
          payment_provider_secret_key: 'api_key_secret',
        },
      ],
      error: null,
    }),
    from: (table: string) => makeBuilder(table),
  } as never;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GrowPaymentProvider.constructEvent', () => {
  it('calls approveTransaction on a successful notify and returns the event', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 1 }), { status: 200 }));

    const provider = new GrowPaymentProvider(makeService());
    const event = await provider.constructEvent(
      JSON.stringify(paymentNotify),
      new Headers(),
      '00000000-0000-0000-0000-0000000000aa',
    );

    expect(event.type).toBe('payment.succeeded');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('approveTransaction');
    const body = JSON.parse((init as { body?: string }).body as string);
    expect(body.transactionId).toBe('9988776');
    expect(body.transactionToken).toBe('tok_sandbox_redacted');
  });

  it('does not approve when the notify is declined', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    const provider = new GrowPaymentProvider(makeService());
    const event = await provider.constructEvent(
      JSON.stringify({ ...(paymentNotify as Record<string, unknown>), status: 0 }),
      new Headers(),
      '00000000-0000-0000-0000-0000000000aa',
    );

    expect(event.type).toBe('payment.failed');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
