import { parseTermPriceSnapshot } from '@shared/termPricing';

/**
 * Term pricing: the first payment the family was shown for the plan they picked (monthly payment
 * or the whole term, less a trial class), so the studio records exactly that. Null when the
 * enrolment is not term-priced.
 */
export function termFirstPaymentMinor(engagement: { term_price?: unknown }): number | null {
  const term = parseTermPriceSnapshot(engagement.term_price);
  return term ? term.firstPaymentMinor[term.plan] : null;
}
