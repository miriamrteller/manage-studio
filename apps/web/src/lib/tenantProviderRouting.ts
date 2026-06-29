/** Slug-based payment/invoicing routing — never use `country === 'IL'` alone. */

export interface TenantProviderContext {
  country?: string | null;
  payment_provider?: string | null;
  invoicing_provider?: string | null;
}

export function tenantUsesGrow(tenant: TenantProviderContext | null | undefined): boolean {
  return tenant?.payment_provider === 'grow';
}

export function tenantUsesIcount(tenant: TenantProviderContext | null | undefined): boolean {
  return tenant?.payment_provider === 'icount';
}

export function tenantUsesBundledProvider(tenant: TenantProviderContext | null | undefined): boolean {
  const payment = tenant?.payment_provider;
  const invoicing = tenant?.invoicing_provider;
  if (!payment || !invoicing || payment !== invoicing) {
    return false;
  }
  return payment === 'grow' || payment === 'icount';
}

/** Bundled IL providers — payment + invoicing on one slug. */
export type BundledPaymentProviderSlug = 'grow' | 'icount';

export function getBundledPaymentProviderSlug(
  tenant: TenantProviderContext | null | undefined,
): BundledPaymentProviderSlug | null {
  if (tenantUsesGrow(tenant)) return 'grow';
  if (tenantUsesIcount(tenant)) return 'icount';
  return null;
}

export function tenantUsesBundledPayments(
  tenant: TenantProviderContext | null | undefined,
): boolean {
  return getBundledPaymentProviderSlug(tenant) !== null;
}

/** Stripe-style split payment + invoicing providers (non-bundled). */
export function tenantUsesSplitProviders(tenant: TenantProviderContext | null | undefined): boolean {
  return !tenantUsesBundledPayments(tenant);
}

/** Hosted-page checkout (Grow or iCount CC page redirect). */
export function isHostedPageCheckoutReady(
  paymentProvider: string | null | undefined,
  pageUrl: string | null | undefined,
): boolean {
  return (paymentProvider === 'grow' || paymentProvider === 'icount') && Boolean(pageUrl);
}

export function isMockHostedPaymentPage(
  paymentProvider: string | null | undefined,
  pageUrl: string | null | undefined,
): boolean {
  if (!pageUrl) return false;
  if (paymentProvider === 'grow') return pageUrl.includes('mock.grow.local');
  if (paymentProvider === 'icount') return pageUrl.includes('mock.icount.local');
  return false;
}
