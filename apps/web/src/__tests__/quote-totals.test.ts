/**
 * Quote totals (gross) — TS mirror of quote_recalc_totals / quote_deposit_minor.
 * Fixtures are shared with supabase/tests/quotes/10_quotes_test.sql.
 */
import { describe, expect, it } from 'vitest';
import {
  computeQuoteTotals,
  quoteDepositMinor,
  resolveOfferingPrice,
  type QuoteLineInput,
} from '@shared/index';
import fixtures from '../../../../supabase/tests/quotes/totals-fixtures.json';

describe('quoteDepositMinor', () => {
  it.each(fixtures.deposit)('$percent% of $total → $deposit', ({ total, percent, deposit }) => {
    expect(quoteDepositMinor(total, percent)).toBe(deposit);
  });

  it('is exact round-half-up for every total/percent pair in range', () => {
    for (let total = 0; total <= 2000; total += 7) {
      for (let percent = 0; percent <= 100; percent += 1) {
        const exact = (total * percent) / 100;
        const expected = exact - Math.floor(exact) >= 0.5 ? Math.ceil(exact) : Math.floor(exact);
        expect(quoteDepositMinor(total, percent)).toBe(expected);
      }
    }
  });

  it('rejects fractional or out-of-range inputs', () => {
    expect(() => quoteDepositMinor(10.5, 30)).toThrow(RangeError);
    expect(() => quoteDepositMinor(-1, 30)).toThrow(RangeError);
    expect(() => quoteDepositMinor(100, 101)).toThrow(RangeError);
    expect(() => quoteDepositMinor(100, 12.5)).toThrow(RangeError);
  });
});

describe('computeQuoteTotals', () => {
  it.each(fixtures.quotes)('$name', ({ lines, depositPercent, expected }) => {
    const totals = computeQuoteTotals(lines as QuoteLineInput[], depositPercent);
    expect(totals).toMatchObject(expected);
    expect(totals.depositMinor + totals.balanceMinor).toBe(totals.totalMinor);
  });

  it('never invents a VAT split (gross mode, like resolveOfferingPrice)', () => {
    const totals = computeQuoteTotals(fixtures.quotes[0].lines as QuoteLineInput[], 30);
    const offering = resolveOfferingPrice({ price_minor: 45000 });
    expect(totals).toMatchObject({
      pretaxMinor: offering.pretaxMinor,
      vatMinor: offering.vatMinor,
      vatRate: offering.vatRate,
      mode: offering.mode,
    });
    expect(totals.vatMinor).toBe(0);
  });

  it('ignores the selected flag on required lines', () => {
    const totals = computeQuoteTotals(
      [{ qty: 1, unit_price_minor: 1000, is_optional: false, is_selected: false }],
      50,
    );
    expect(totals.totalMinor).toBe(1000);
  });

  it('returns zeros for an empty quote', () => {
    expect(computeQuoteTotals([], 30)).toMatchObject({ totalMinor: 0, depositMinor: 0, balanceMinor: 0 });
  });
});
