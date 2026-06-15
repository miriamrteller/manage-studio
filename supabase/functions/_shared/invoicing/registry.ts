export const INVOICING_PROVIDER_SLUGS = ['green_invoice', 'mock'] as const;
export type InvoicingProviderSlug = (typeof INVOICING_PROVIDER_SLUGS)[number];
