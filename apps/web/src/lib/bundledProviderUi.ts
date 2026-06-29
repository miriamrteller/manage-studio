import type { TFunction } from 'i18next';
import type { BundledPaymentProviderSlug } from '@/lib/tenantProviderRouting';

export const BUNDLED_PAYMENTS_SETUP_PATH = '/admin/setup/bundled-payments';

/** Equal bundled-provider choices — order is display-only, not a default preference. */
export const BUNDLED_PAYMENT_PROVIDER_OPTIONS: BundledPaymentProviderSlug[] = ['grow', 'icount'];

const PROVIDER_NAMES: Record<BundledPaymentProviderSlug, string> = {
  grow: 'Grow',
  icount: 'iCount',
};

export function bundledProviderDisplayName(slug: BundledPaymentProviderSlug): string {
  return PROVIDER_NAMES[slug];
}

/** Nav / hub card — generic; provider name appears on the settings page only. */
export function bundledPaymentsNavTitle(t: TFunction): string {
  return t('settings.bundled.nav_title', { defaultValue: 'Payments & invoices' });
}

export function bundledPaymentsHubDescription(t: TFunction): string {
  return t('settings.bundled.hub_description', {
    defaultValue: 'Card payments and tax documents in one place',
  });
}

export function bundledTaxVatMessage(t: TFunction, slug: BundledPaymentProviderSlug): string {
  if (slug === 'icount') {
    return t('settings.tax.icount_handles_vat', {
      defaultValue:
        'iCount issues tax documents with card payments; VAT is handled in iCount.',
    });
  }
  return t('settings.tax.grow_handles_vat');
}
