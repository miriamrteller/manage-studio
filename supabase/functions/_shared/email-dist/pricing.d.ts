/**
 * Canonical offering price resolution (SPEC §2.5.1).
 * Used by web, Edge Functions (via email-dist bundle), and offline payments.
 */
export type VatPricingMode = 'inclusive' | 'exclusive';
export interface OfferingPriceInput {
    price_minor: number;
}
export interface TenantPricingInput {
    vat_rate: number;
    prices_include_vat: boolean;
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
/** Split gross total into pretax + VAT (remainder avoids rounding drift). */
export declare function calculateVat(totalMinor: number, vatRate: number): {
    pretax: number;
    vat: number;
    total: number;
};
/** Add VAT to a net (pretax) amount. */
export declare function addVatToPretax(pretaxMinor: number, vatRate: number): {
    pretax: number;
    vat: number;
    total: number;
};
export declare function resolveOfferingPrice(offering: OfferingPriceInput, tenant: TenantPricingInput): OfferingPriceBreakdown;
//# sourceMappingURL=pricing.d.ts.map