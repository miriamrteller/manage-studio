/**
 * registry.ts — Provider slug constants
 *
 * These are the ONLY string values allowed in:
 *   tenant_configs.payment_provider
 *   tenant_configs.invoicing_provider
 *
 * Update both arrays when registering a new provider, then add the corresponding
 * case to providerForPayment() and/or providerForInvoicing() in ./index.ts.
 */

export const PAYMENT_PROVIDERS = ["rapyd", "icount_paypage", "grow", "tranzila"] as const;
export type  PaymentProviderSlug = typeof PAYMENT_PROVIDERS[number];

export const INVOICING_PROVIDERS = ["yesh", "icount", "tranzila"] as const;
export type  InvoicingProviderSlug = typeof INVOICING_PROVIDERS[number];
