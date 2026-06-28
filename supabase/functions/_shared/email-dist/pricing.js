/**
 * Offering price resolution — gross amounts only.
 * VAT breakdown on receipts/invoices comes from the invoicing provider (Grow, Green Invoice).
 * This module must not split pretax/VAT.
 */
export function resolveOfferingPrice(offering, _tenant) {
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
