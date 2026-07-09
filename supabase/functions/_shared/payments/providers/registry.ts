/**
 * registry.ts — Provider slug constants
 * These are the only string values allowed in tenant_configs.payment_provider
 * and tenant_configs.invoicing_provider columns.
 */

export const PAYMENT_PROVIDERS = ['rapyd', 'icount_paypage', 'grow'] as const;
export type  PaymentProviderSlug = typeof PAYMENT_PROVIDERS[number];

export const INVOICING_PROVIDERS = ['yesh', 'icount'] as const;
export type  InvoicingProviderSlug = typeof INVOICING_PROVIDERS[number];
