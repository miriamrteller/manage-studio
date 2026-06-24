import { describe, it, expect } from 'vitest';
import { computeExpenseAmounts } from '@/features/finance-admin/lib/expenseAmounts';

describe('expense-form amounts', () => {
  it('computes VAT-inclusive amounts from gross input', () => {
    const result = computeExpenseAmounts({
      amountMinor: 1170,
      vatRate: 0.17,
      pricesIncludeVat: true,
      isVatEligible: true,
    });
    expect(result.totalAmountMinor).toBe(1170);
    expect(result.pretaxAmountMinor).toBe(1000);
    expect(result.vatAmountMinor).toBe(170);
  });

  it('computes VAT-exclusive amounts from net input', () => {
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

  it('produces negative correction amounts when input is negated', () => {
    const base = computeExpenseAmounts({
      amountMinor: 1170,
      vatRate: 0.17,
      pricesIncludeVat: true,
      isVatEligible: true,
    });
    const correction = {
      pretaxAmountMinor: -base.pretaxAmountMinor,
      vatAmountMinor: -base.vatAmountMinor,
      totalAmountMinor: -base.totalAmountMinor,
    };
    expect(correction.totalAmountMinor).toBeLessThan(0);
    expect(correction.pretaxAmountMinor).toBeLessThan(0);
  });
});
