import { describe, it, expect } from 'vitest';
import { computeExpenseAmounts } from '@/features/finance-admin/lib/expenseAmounts';

describe('computeExpenseAmounts', () => {
  it('splits inclusive VAT at 17%', () => {
    const result = computeExpenseAmounts({
      amountMinor: 1170,
      vatRate: 0.17,
      pricesIncludeVat: true,
      isVatEligible: true,
    });
    expect(result.pretaxAmountMinor).toBe(1000);
    expect(result.vatAmountMinor).toBe(170);
    expect(result.totalAmountMinor).toBe(1170);
  });

  it('adds VAT to pretax when exclusive', () => {
    const result = computeExpenseAmounts({
      amountMinor: 1000,
      vatRate: 0.17,
      pricesIncludeVat: false,
      isVatEligible: true,
    });
    expect(result.pretaxAmountMinor).toBe(1000);
    expect(result.vatAmountMinor).toBe(170);
    expect(result.totalAmountMinor).toBe(1170);
  });

  it('forces zero VAT when category is not VAT-eligible', () => {
    const result = computeExpenseAmounts({
      amountMinor: 5000,
      vatRate: 0.17,
      pricesIncludeVat: true,
      isVatEligible: false,
    });
    expect(result.vatAmountMinor).toBe(0);
    expect(result.totalAmountMinor).toBe(5000);
    expect(result.pretaxAmountMinor).toBe(5000);
  });
});
