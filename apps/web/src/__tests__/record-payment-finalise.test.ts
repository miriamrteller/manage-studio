/**
 * G1: documents the side effects the record-payment + process-refund edge functions
 * must guarantee. These are deterministic-money contracts (no AI, single finalise spine).
 * Run: pnpm -C apps/web test record-payment-finalise.test.ts
 */
import { describe, it, expect } from 'vitest';

/** Manual offline payment row contract (record-payment/index.ts). */
function buildManualPaymentRow(input: {
  tenantId: string;
  engagementId: string;
  method: 'cash' | 'bank_transfer';
  totalMinor: number;
  vatRate: number;
}) {
  const pretaxMinor = Math.round(input.totalMinor / (1 + input.vatRate));
  const vatMinor = input.totalMinor - pretaxMinor;
  return {
    engagement_id: input.engagementId,
    charge_type: 'initial' as const,
    provider: 'manual' as const,
    payment_method: input.method,
    status: 'succeeded' as const,
    pretax_amount_minor: pretaxMinor,
    vat_amount_minor: vatMinor,
    total_amount_minor: input.totalMinor,
  };
}

/** Proportional VAT split for a (partial) refund credit note (process-refund/index.ts). */
function computeRefundSplit(input: {
  refundAmountMinor: number;
  originalPretaxMinor: number;
  originalTotalMinor: number;
}) {
  const pretaxPortion = Math.round(
    input.refundAmountMinor * (input.originalPretaxMinor / input.originalTotalMinor),
  );
  return {
    pretax_amount_minor: -pretaxPortion,
    vat_amount_minor: -(input.refundAmountMinor - pretaxPortion),
    total_amount_minor: -input.refundAmountMinor,
    charge_type: 'refund' as const,
  };
}

describe('record-payment manual offline contract', () => {
  it('records provider=manual, charge_type=initial with VAT-inclusive split', () => {
    const row = buildManualPaymentRow({
      tenantId: '00000000-0000-0000-0000-000000000001',
      engagementId: '00000000-0000-0000-0000-000000001001',
      method: 'cash',
      totalMinor: 35000,
      vatRate: 0.17,
    });

    expect(row.provider).toBe('manual');
    expect(row.charge_type).toBe('initial');
    expect(row.status).toBe('succeeded');
    expect(row.pretax_amount_minor + row.vat_amount_minor).toBe(row.total_amount_minor);
  });
});

describe('process-refund credit-note contract', () => {
  it('produces a negative credit note with proportional VAT', () => {
    const split = computeRefundSplit({
      refundAmountMinor: 35000,
      originalPretaxMinor: 29915,
      originalTotalMinor: 35000,
    });

    expect(split.charge_type).toBe('refund');
    expect(split.total_amount_minor).toBe(-35000);
    expect(split.pretax_amount_minor + split.vat_amount_minor).toBe(split.total_amount_minor);
  });

  it('splits a partial refund proportionally', () => {
    const split = computeRefundSplit({
      refundAmountMinor: 10000,
      originalPretaxMinor: 29915,
      originalTotalMinor: 35000,
    });

    expect(split.total_amount_minor).toBe(-10000);
    expect(split.pretax_amount_minor).toBeLessThan(0);
    expect(split.pretax_amount_minor + split.vat_amount_minor).toBe(-10000);
  });
});
