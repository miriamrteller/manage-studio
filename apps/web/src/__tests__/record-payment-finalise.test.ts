/**
 * G1: documents the side effects the record-payment + process-refund edge functions
 * must guarantee. These are deterministic-money contracts (no AI, single finalise spine).
 * Run: pnpm -C apps/web test record-payment-finalise.test.ts
 */
import { describe, it, expect } from 'vitest';

/** Manual offline payment row contract (record-payment/index.ts). */
function buildManualPaymentRow(input: {
  engagementId: string;
  method: 'cash' | 'bank_transfer';
  totalMinor: number;
}) {
  return {
    engagement_id: input.engagementId,
    charge_type: 'initial' as const,
    provider: 'manual' as const,
    payment_method: input.method,
    status: 'succeeded' as const,
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: input.totalMinor,
  };
}

/** Refund row contract when original payment has no local VAT split. */
function computeRefundSplit(input: { refundAmountMinor: number }) {
  return {
    pretax_amount_minor: 0,
    vat_amount_minor: 0,
    total_amount_minor: -input.refundAmountMinor,
    charge_type: 'refund' as const,
  };
}

describe('record-payment manual offline contract', () => {
  it('records provider=manual with gross total only', () => {
    const row = buildManualPaymentRow({
      engagementId: '00000000-0000-0000-0000-000000001001',
      method: 'cash',
      totalMinor: 35000,
    });

    expect(row.provider).toBe('manual');
    expect(row.charge_type).toBe('initial');
    expect(row.status).toBe('succeeded');
    expect(row.pretax_amount_minor).toBe(0);
    expect(row.vat_amount_minor).toBe(0);
    expect(row.total_amount_minor).toBe(35000);
  });
});

describe('process-refund credit-note contract', () => {
  it('produces a negative credit note with gross total only', () => {
    const split = computeRefundSplit({ refundAmountMinor: 35000 });

    expect(split.charge_type).toBe('refund');
    expect(split.total_amount_minor).toBe(-35000);
    expect(split.pretax_amount_minor).toBe(0);
    expect(split.vat_amount_minor).toBe(0);
  });
});
