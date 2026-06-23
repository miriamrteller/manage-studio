/**
 * G6: Grow refundCharge calls refundTransaction with the original transaction id.
 * Run: pnpm -C apps/web test grow-refund.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';

function makeService() {
  return {
    rpc: async () => ({
      data: [
        { payment_provider_public_key: 'page_code_123', payment_provider_secret_key: 'api_key' },
      ],
      error: null,
    }),
    from: (table: string) => {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { tenant_id: '00000000-0000-0000-0000-0000000000aa' },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { payment_provider_account_id: 'grow_user_1' }, error: null }),
          }),
        }),
      };
    },
  } as never;
}

afterEach(() => vi.restoreAllMocks());

describe('GrowPaymentProvider.refundCharge', () => {
  it('calls refundTransaction with the original transaction id and returns the refund ref', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 1, data: { refundId: 'GROW-REF-9' } }), { status: 200 }),
      );

    const provider = new GrowPaymentProvider(makeService());
    const result = await provider.refundCharge!({
      providerPaymentRef: 'grow_txn_777',
      amountMinor: 35000,
    });

    expect(result.providerRefundRef).toBe('GROW-REF-9');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('refundTransaction');
    const body = JSON.parse((init as { body?: string }).body as string);
    expect(body.transactionId).toBe('grow_txn_777');
    expect(body.sum).toBe('350.00');
  });

  it('throws the provider error when the refund is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 0 }), { status: 200 }),
    );
    const provider = new GrowPaymentProvider(makeService());
    await expect(
      provider.refundCharge!({ providerPaymentRef: 'grow_txn_777', amountMinor: 35000 }),
    ).rejects.toThrow(/refund/i);
  });
});
