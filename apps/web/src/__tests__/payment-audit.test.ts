import { describe, it, expect } from 'vitest';
import {
  PAYMENT_FAILED,
  PAYMENT_PENDING_CREATED,
  auditPaymentFailed,
  auditPaymentPendingCreated,
} from '../../../../supabase/functions/_shared/payments/payment-audit.ts';

describe('payment-audit helpers', () => {
  it('writes normalized payment.failed after_state', async () => {
    const audits: Record<string, unknown>[] = [];
    const service = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          audits.push(row);
          return { error: null };
        },
      }),
    } as never;

    await auditPaymentFailed(service, {
      tenantId: 't1',
      entityId: 'pay-1',
      afterState: {
        provider_payment_ref: 'ref-1',
        message: 'declined',
        engagement_id: 'eng-1',
        payment_id: 'pay-1',
        order_id_client_usage: 'order-1',
      },
    });

    expect(audits[0]).toMatchObject({
      action: PAYMENT_FAILED,
      entity_id: 'pay-1',
      after_state: {
        provider_payment_ref: 'ref-1',
        message: 'declined',
        engagement_id: 'eng-1',
        payment_id: 'pay-1',
        order_id_client_usage: 'order-1',
      },
    });
  });

  it('writes payment.pending_created on pending insert', async () => {
    const audits: Record<string, unknown>[] = [];
    const service = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          audits.push(row);
          return { error: null };
        },
      }),
    } as never;

    await auditPaymentPendingCreated(service, {
      tenantId: 't1',
      paymentId: 'pay-1',
      providerPaymentRef: 'order-1',
      engagementId: 'eng-1',
      chargeType: 'initial',
      provider: 'invoice4u',
      amountMinor: 24000,
      currency: 'ILS',
    });

    expect(audits[0]).toMatchObject({
      action: PAYMENT_PENDING_CREATED,
      entity_id: 'pay-1',
      after_state: {
        provider_payment_ref: 'order-1',
        engagement_id: 'eng-1',
        provider: 'invoice4u',
      },
    });
  });
});
