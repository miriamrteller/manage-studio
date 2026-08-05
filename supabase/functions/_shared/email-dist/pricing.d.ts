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
export declare function resolveOfferingPrice(offering: OfferingPriceInput): OfferingPriceBreakdown;
//# sourceMappingURL=pricing.d.ts.map