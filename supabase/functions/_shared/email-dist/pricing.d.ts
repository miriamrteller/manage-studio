/**
 * Offering price resolution — gross amounts only.
 * VAT breakdown on receipts/invoices comes from the invoicing provider (Grow, Green Invoice).
 * This module must not split pretax/VAT.
 */
export type VatPricingMode = 'gross';
export interface OfferingPriceInput {
    price_minor: number;
}
/** @deprecated Tenant VAT fields are not used for local computation. Kept for call-site compatibility. */
export interface TenantPricingInput {
    vat_rate?: number;
    prices_include_vat?: boolean;
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
export declare function resolveOfferingPrice(offering: OfferingPriceInput, _tenant?: TenantPricingInput): OfferingPriceBreakdown;
//# sourceMappingURL=pricing.d.ts.map