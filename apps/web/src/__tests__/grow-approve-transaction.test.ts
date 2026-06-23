/**
 * G4a: constructEvent always calls Grow's Approve Transaction on a successful notify.
 * Run: pnpm -C apps/web test grow-approve-transaction.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';
import paymentNotify from './fixtures/grow-payment-notify.json';

function makeService() {
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
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { payment_provider_account_id: 'grow_user_1' }, error: null }),
        }),
      }),
    }),
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
