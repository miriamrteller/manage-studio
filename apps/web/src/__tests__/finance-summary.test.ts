import { describe, it, expect } from 'vitest';
import { FinanceSummarySchema } from '@shared/schemas';
import { getJerusalemMonthRange } from '@/features/finance-admin/lib/periods';

describe('finance-summary', () => {
  it('parses FinanceSummary RPC row', () => {
    const row = {
      net_revenue_minor: 10000,
      payment_count: 3,
      outstanding_engagements: 2,
      failed_payments_7d: 1,
      net_expenses_minor: 2500,
    };
    expect(FinanceSummarySchema.parse(row)).toEqual(row);
  });

  it('returns Jerusalem month bounds for a fixed UTC instant', () => {
    const range = getJerusalemMonthRange(new Date('2026-06-15T12:00:00Z'));
    expect(range.startDate).toBe('2026-06-01');
    expect(range.endDate).toBe('2026-06-30');
  });
});
