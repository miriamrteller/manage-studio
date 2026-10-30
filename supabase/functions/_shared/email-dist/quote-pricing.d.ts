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
import { type VatPricingMode } from './pricing.js';
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
export declare function quoteDepositMinor(totalMinor: number, depositPercent: number): number;
export declare function quoteLineTotalMinor(line: Pick<QuoteLineInput, 'qty' | 'unit_price_minor'>): number;
export declare function isQuoteLineIncluded(line: Pick<QuoteLineInput, 'is_optional' | 'is_selected'>): boolean;
export declare function computeQuoteTotals(lines: readonly QuoteLineInput[], depositPercent: number): QuoteTotals;
//# sourceMappingURL=quote-pricing.d.ts.map