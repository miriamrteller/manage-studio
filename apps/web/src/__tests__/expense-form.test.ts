import { describe, it, expect } from 'vitest';
import { computeExpenseAmounts } from '@/features/finance-admin/lib/expenseAmounts';

describe('expense-form amounts', () => {
  it('stores gross total without VAT split', () => {
    const result = computeExpenseAmounts({ amountMinor: 1170 });
    expect(result).toEqual({
      pretaxAmountMinor: 1170,
      vatAmountMinor: 0,
      totalAmountMinor: 1170,
    });
  });

  it('produces negative correction amounts when input is negated', () => {
    const base = computeExpenseAmounts({ amountMinor: 1170 });
    const correction = {
      pretaxAmountMinor: -base.pretaxAmountMinor,
      vatAmountMinor: -base.vatAmountMinor,
      totalAmountMinor: -base.totalAmountMinor,
    };
    expect(correction.totalAmountMinor).toBe(-1170);
    expect(correction.vatAmountMinor).toBe(0);
  });
});
