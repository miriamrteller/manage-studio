/**
 * Quote totals — gross amounts only, same contract as resolveOfferingPrice().
 *
 * The SQL side (quote_recalc_totals + quote_deposit_minor in
 * 20261030000300_quotes.sql) is authoritative and stores the totals; this
 * mirror exists for live previews in the admin editor and the public quote
 * page. Both use the same formula and share test fixtures — change them
 * together.
 *
 * No pretax/VAT split: the invoicing provider owns it (SPEC §2.5.1).
 */
import { resolveOfferingPrice, type VatPricingMode } from './pricing.js';

export interface QuoteLineInput {
  qty: number;
  unit_price_minor: number;
  is_optional: boolean;
  /** Only meaningful for optional lines; required lines are always included. */
  is_selected: boolean;
}

export interface QuoteTotals {
  requiredMinor: number;
  optionalSelectedMinor: number;
  totalMinor: number;
  depositMinor: number;
  balanceMinor: number;
  pretaxMinor: number;
  vatMinor: number;
  vatRate: number;
  mode: VatPricingMode;
}

/** Round-half-up of total × percent / 100 on integers (matches quote_deposit_minor). */
export function quoteDepositMinor(totalMinor: number, depositPercent: number): number {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new RangeError('totalMinor must be a non-negative integer');
  }
  if (!Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    throw new RangeError('depositPercent must be an integer between 0 and 100');
  }
  return Math.floor((totalMinor * depositPercent + 50) / 100);
}

export function quoteLineTotalMinor(line: Pick<QuoteLineInput, 'qty' | 'unit_price_minor'>): number {
  const unit = resolveOfferingPrice({ price_minor: line.unit_price_minor }).chargeMinor;
  return line.qty * unit;
}

export function isQuoteLineIncluded(line: Pick<QuoteLineInput, 'is_optional' | 'is_selected'>): boolean {
  return !line.is_optional || line.is_selected;
}

export function computeQuoteTotals(
  lines: readonly QuoteLineInput[],
  depositPercent: number,
): QuoteTotals {
  let requiredMinor = 0;
  let optionalSelectedMinor = 0;
  for (const line of lines) {
    const lineTotal = quoteLineTotalMinor(line);
    if (!line.is_optional) requiredMinor += lineTotal;
    else if (line.is_selected) optionalSelectedMinor += lineTotal;
  }
  const totalMinor = requiredMinor + optionalSelectedMinor;
  const depositMinor = quoteDepositMinor(totalMinor, depositPercent);
  return {
    requiredMinor,
    optionalSelectedMinor,
    totalMinor,
    depositMinor,
    balanceMinor: totalMinor - depositMinor,
    pretaxMinor: 0,
    vatMinor: 0,
    vatRate: 0,
    mode: 'gross',
  };
}
