import { describe, it, expect } from 'vitest';
import { computeExpenseAmounts } from '@/features/finance-admin/lib/expenseAmounts';

describe('computeExpenseAmounts', () => {
  it('stores gross total without VAT split', () => {
    expect(computeExpenseAmounts({ amountMinor: 200000 })).toEqual({
      pretaxAmountMinor: 200000,
      vatAmountMinor: 0,
      totalAmountMinor: 200000,
    });
  });
});
