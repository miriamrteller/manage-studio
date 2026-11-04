/**
 * Takbull PR 4: refunds through Takbull's Refund, with Takbull's credit document (types 2 / 4).
 * Fake database and fake Takbull only.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import { buildTakbullRefund, TakbullPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/takbull';
import { MockTakbullApi } from '../../../../supabase/functions/_shared/payments/takbull/mock';
import { refundDocumentIssuedWithRefund } from '../../../../supabase/functions/_shared/payments/refund-provider';
import { ManualRefundRequiredError } from '../../../../supabase/functions/_shared/payments/refund-errors';
import { refundDocumentNoteKey } from '../features/finance/components/RefundAmountChoice';

const TENANT = '00000000-0000-4000-8000-0000000000aa';
const TX = '000001003';

function seed(over: Record<string, unknown> = {}) {
  return makeFakeSupabase({
    payments: [{ id: 'pay-1', tenant_id: TENANT, provider: 'takbull', provider_payment_ref: TX, status: 'succeeded', total_amount_minor: 35000, refund_amount_minor: null, ...over }],
  });
}

describe('the Refund request', () => {
  it('the whole payment cancels the deal with its document (type 2, no amount)', () => {
    expect(buildTakbullRefund({ transactionInternalNumber: TX, amountMinor: 35000, totalMinor: 35000, alreadyRefundedMinor: 0 }))
      .toEqual({ RefundType: 2, RefundAmount: null, TransactionInternalNumber: TX });
  });

  it('part of it, or what is left after a partial refund, is a partial refund with its document (type 4)', () => {
    expect(buildTakbullRefund({ transactionInternalNumber: TX, amountMinor: 11550, totalMinor: 35000, alreadyRefundedMinor: 0 }))
      .toEqual({ RefundType: 4, RefundAmount: 115.5, TransactionInternalNumber: TX });
    expect(buildTakbullRefund({ transactionInternalNumber: TX, amountMinor: 23450, totalMinor: 35000, alreadyRefundedMinor: 11550 }))
      .toMatchObject({ RefundType: 4, RefundAmount: 234.5 });
  });
});

describe('refundCharge', () => {
  it("refunds by Takbull's transaction number, on the studio's own account", async () => {
    const { client } = seed();
    const api = new MockTakbullApi();
    const apiFor = vi.fn(async () => api);
    const result = await new TakbullPaymentProvider(client as never, apiFor).refundCharge({ providerPaymentRef: TX, amountMinor: 10000 });
    expect(apiFor).toHaveBeenCalledWith(TENANT);
    expect(api.refunds).toEqual([{ RefundType: 4, RefundAmount: 100, TransactionInternalNumber: TX }]);
    expect(result.providerRefundRef).toMatch(/^takbull_/);
  });

  it("Takbull's refusal reaches the admin; nothing is recorded as refunded", async () => {
    const { client } = seed();
    const api = new MockTakbullApi();
    api.refund = () => Promise.reject(new Error('Transaction already cancelled'));
    await expect(new TakbullPaymentProvider(client as never, async () => api).refundCharge({ providerPaymentRef: TX, amountMinor: 35000 }))
      .rejects.toThrow('Transaction already cancelled');
  });

  it('a payment without a Takbull transaction number is refunded in Takbull and recorded here', async () => {
    const { client } = seed({ provider_payment_ref: 'takbull_new_x' });
    const api = new MockTakbullApi();
    await expect(new TakbullPaymentProvider(client as never, async () => api).refundCharge({ providerPaymentRef: 'takbull_new_x', amountMinor: 100 }))
      .rejects.toBeInstanceOf(ManualRefundRequiredError);
    expect(api.refunds).toHaveLength(0);
  });
});

describe('the refund document', () => {
  it('Takbull issues it with a refund made through Takbull; one recorded by hand is still queued', () => {
    expect(refundDocumentIssuedWithRefund({ provider: 'takbull', manual: false })).toBe(true);
    expect(refundDocumentIssuedWithRefund({ provider: 'takbull', manual: true })).toBe(false);
    expect(refundDocumentIssuedWithRefund({ provider: 'grow', manual: false })).toBe(false);
    expect(refundDocumentNoteKey('takbull')).toBe('finance.refund_payment.document_takbull');
  });
});
