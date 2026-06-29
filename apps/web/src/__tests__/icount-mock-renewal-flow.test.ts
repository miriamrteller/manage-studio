/**
 * I4-mock-parity: MockIcount renewal uses cc/bill + pendingWebhook (no emitSyncEvent).
 * Run: pnpm -C apps/web test icount-mock-renewal-flow.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockIcountPaymentProvider } from '../../../../supabase/functions/_shared/payments/providers/mock-icount.ts';
import { buildChargeMetadata } from '../../../../supabase/functions/_shared/payments/providers/mock.ts';
import { deliverMockIcountIpn } from '../../../../supabase/functions/_shared/payments/icount/mock-api.ts';

vi.mock('../../../../supabase/functions/_shared/payments/handle-payment-event.ts', () => ({
  handlePaymentEventInternal: vi.fn(async () => ({ paymentId: 'pay-1', duplicate: false })),
}));

const renewalMetadata = buildChargeMetadata({
  tenantId: '00000000-0000-0000-0000-0000000000bb',
  engagementId: '11111111-1111-1111-1111-111111111111',
  billingAccountId: '22222222-2222-2222-2222-222222222222',
  offeringId: '33333333-3333-3333-3333-333333333333',
  personId: '44444444-4444-4444-4444-444444444444',
  vatRate: 0.17,
  pretaxMinor: 29915,
  vatMinor: 5085,
  totalMinor: 35000,
  chargeType: 'renewal',
  billingScheduleId: '55555555-5555-5555-5555-555555555555',
});

afterEach(() => vi.restoreAllMocks());

describe('MockIcountPaymentProvider renewal flow', () => {
  it('createCharge ignores savedToken and returns hosted page', async () => {
    const provider = new MockIcountPaymentProvider();
    const result = await provider.createCharge({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'enrol-1',
      metadata: renewalMetadata,
      savedToken: 'should_be_ignored',
    });

    expect(result.pageUrl).toContain('mock.icount.local');
    expect(result.pendingWebhook).toBe(true);
    expect(result.emitSyncEvent).toBeUndefined();
  });

  it('chargeWithToken returns pendingWebhook without emitSyncEvent', async () => {
    const provider = new MockIcountPaymentProvider();
    const result = await provider.chargeWithToken({
      amountMinor: 35000,
      currency: 'ILS',
      idempotencyKey: 'renew-2026-06',
      metadata: renewalMetadata,
      savedToken: 'icount_tok_abc',
    });

    expect(result.providerPaymentRef).toMatch(/^mockicount_/);
    expect(result.pendingWebhook).toBe(true);
    expect(result.emitSyncEvent).toBeUndefined();
    expect(result.pageUrl).toBeUndefined();
  });

  it('deliverMockIcountIpn exercises constructEvent then handlePaymentEventInternal', async () => {
    const { handlePaymentEventInternal } = await import(
      '../../../../supabase/functions/_shared/payments/handle-payment-event.ts'
    );
    const provider = new MockIcountPaymentProvider();
    const constructSpy = vi.spyOn(provider, 'constructEvent');

    await deliverMockIcountIpn({} as never, provider, {
      providerPaymentRef: 'mockicount_renew_xyz',
      amountMinor: 35000,
      currency: 'ILS',
      metadata: renewalMetadata,
      tenantId: renewalMetadata.tenant_id,
    });

    expect(constructSpy).toHaveBeenCalledOnce();
    const ipnBody = constructSpy.mock.calls[0][0] as string;
    expect(ipnBody).toContain('confirmation_code=');
    expect(ipnBody).toContain('charge_type=renewal');
    expect(handlePaymentEventInternal).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ type: 'payment.succeeded' }),
      'icount',
    );
  });
});
