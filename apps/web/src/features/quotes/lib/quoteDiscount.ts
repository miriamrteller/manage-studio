/**
 * The client's own discount on a quote, shown before they accept. The payment requests
 * made on acceptance get the same discount from the database
 * (private.apply_request_discounts in 20261124152000_discounts_for_every_sale.sql); this
 * mirrors it so the page can follow the optional extras the client ticks:
 * a percentage comes off the deposit and the balance, a fixed amount once (off the deposit
 * when there is one), each payment within the studio's maximum.
 */
export interface QuoteClientDiscount {
  rules: Array<{ unit: 'percent' | 'amount'; value: number }>;
  max_total_percent: number;
}

export interface QuoteDiscountPreview {
  discountMinor: number;
  totalAfterMinor: number;
  depositAfterMinor: number;
  balanceAfterMinor: number;
}

function ruleAmount(base: number, unit: string, value: number): number {
  if (base <= 0 || !(value > 0)) return 0;
  return unit === 'percent' ? Math.round((base * value) / 100) : Math.min(value, base);
}

function paymentDiscount(base: number, d: QuoteClientDiscount, amountUsed: boolean): number {
  if (base <= 0) return 0;
  const best = Math.max(
    0,
    ...d.rules.map((r) => (r.unit === 'amount' && amountUsed ? 0 : ruleAmount(base, r.unit, r.value))),
  );
  return Math.min(best, Math.floor((base * d.max_total_percent) / 100));
}

/** Null when the client has no discount (or nothing comes off). */
export function quoteDiscountPreview(
  totals: { depositMinor: number; balanceMinor: number },
  discount: QuoteClientDiscount | null | undefined,
): QuoteDiscountPreview | null {
  if (!discount || !Array.isArray(discount.rules) || discount.rules.length === 0) return null;
  const off1 = paymentDiscount(totals.depositMinor, discount, false);
  const amountUsed = off1 > 0 && discount.rules.some((r) => r.unit === 'amount');
  const off2 = paymentDiscount(totals.balanceMinor, discount, amountUsed);
  const discountMinor = off1 + off2;
  if (discountMinor <= 0) return null;
  const depositAfterMinor = totals.depositMinor - off1;
  const balanceAfterMinor = totals.balanceMinor - off2;
  return { discountMinor, depositAfterMinor, balanceAfterMinor, totalAfterMinor: depositAfterMinor + balanceAfterMinor };
}
