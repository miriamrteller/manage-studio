/**
 * G6: Grow refundCharge calls refundTransaction with Grow's own transaction id and token, stored
 * on the payment when the notice settled it (not our provider_payment_ref, which Grow does not
 * know), and the amount as refundSum.
 * Run: pnpm -C apps/web test grow-refund.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrowPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/grow.ts';

function makeService(transactionId: string | null = '9988776', transactionToken: string | null = 'tok_9988776') {
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
                data: {
                  tenant_id: '00000000-0000-0000-0000-0000000000aa',
                  provider_transaction_id: transactionId,
                  provider_transaction_token: transactionToken,
                },
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

beforeEach(() => {
  vi.stubEnv('GROW_API_BASE', 'https://grow.test/api/light/server/1.0');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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
    // Grow's refundTransaction fields: transactionId (integer), transactionToken, refundSum (number).
    expect(body.transactionId).toBe(9988776);
    expect(body.transactionToken).toBe('tok_9988776');
    expect(body.refundSum).toBe(350);
    expect(body).not.toHaveProperty('sum');
  });

  it('asks for a manual refund when no Grow transaction id is on record (older payments)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new GrowPaymentProvider(makeService(null));
    await expect(
      provider.refundCharge!({ providerPaymentRef: 'grow_txn_777', amountMinor: 35000 }),
    ).rejects.toMatchObject({ code: 'manual_refund_required', provider: 'grow' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks for a manual refund when the transaction token is missing (paid before it was stored)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const provider = new GrowPaymentProvider(makeService('9988776', null));
    await expect(
      provider.refundCharge!({ providerPaymentRef: 'grow_txn_777', amountMinor: 35000 }),
    ).rejects.toMatchObject({ code: 'manual_refund_required', provider: 'grow' });
    expect(fetchSpy).not.toHaveBeenCalled();
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
