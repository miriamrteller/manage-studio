export const PAYMENT_PROVIDER_SLUGS = ['stripe', 'mock'] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];
