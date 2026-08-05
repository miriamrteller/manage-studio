/**
 * Offering price resolution — gross amounts only.
 * VAT breakdown on receipts/invoices comes from the invoicing provider (Grow, Green Invoice).
 * This module must not split pretax/VAT.
 */

export type VatPricingMode = 'gross';

export interface OfferingPriceInput {
  price_minor: number;
}

export interface OfferingPriceBreakdown {
  listMinor: number;
  chargeMinor: number;
  pretaxMinor: number;
  vatMinor: number;
  totalMinor: number;
  vatRate: number;
  mode: VatPricingMode;
}

export function resolveOfferingPrice(
  offering: OfferingPriceInput,
): OfferingPriceBreakdown {
  const listMinor = offering.price_minor;
  return {
    listMinor,
    chargeMinor: listMinor,
    pretaxMinor: 0,
    vatMinor: 0,
    totalMinor: listMinor,
    vatRate: 0,
    mode: 'gross',
  };
}
