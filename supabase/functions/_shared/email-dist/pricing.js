/**
 * Canonical offering price resolution (SPEC §2.5.1).
 * Used by web, Edge Functions (via email-dist bundle), and offline payments.
 */
/** Split gross total into pretax + VAT (remainder avoids rounding drift). */
export function calculateVat(totalMinor, vatRate) {
    const pretaxExact = totalMinor / (1 + vatRate);
    const pretax = Math.round(pretaxExact);
    const vat = totalMinor - pretax;
    return { pretax, vat, total: totalMinor };
}
/** Add VAT to a net (pretax) amount. */
export function addVatToPretax(pretaxMinor, vatRate) {
    const vat = Math.round(pretaxMinor * vatRate);
    return { pretax: pretaxMinor, vat, total: pretaxMinor + vat };
}
export function resolveOfferingPrice(offering, tenant) {
    const listMinor = offering.price_minor;
    const vatRate = Number(tenant.vat_rate ?? 0.17);
    const inclusive = tenant.prices_include_vat !== false;
    if (inclusive) {
        const { pretax, vat, total } = calculateVat(listMinor, vatRate);
        return {
            listMinor,
            chargeMinor: total,
            pretaxMinor: pretax,
            vatMinor: vat,
            totalMinor: total,
            vatRate,
            mode: 'inclusive',
        };
    }
    const { pretax, vat, total } = addVatToPretax(listMinor, vatRate);
    return {
        listMinor,
        chargeMinor: total,
        pretaxMinor: pretax,
        vatMinor: vat,
        totalMinor: total,
        vatRate,
        mode: 'exclusive',
    };
}
