import type { TFunction } from 'i18next';
import type { BundledPaymentProviderSlug } from '@/lib/tenantProviderRouting';

export const BUNDLED_PAYMENTS_SETUP_PATH = '/admin/setup/bundled-payments';

/** Equal bundled-provider choices — order is display-only, not a default preference. */
export const BUNDLED_PAYMENT_PROVIDER_OPTIONS: BundledPaymentProviderSlug[] = [
  'grow',
  'icount',
  'invoice4u',
];

const PROVIDER_NAMES: Record<BundledPaymentProviderSlug, string> = {
  grow: 'Grow',
  icount: 'iCount',
  invoice4u: 'Invoice4U',
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
  if (slug === 'invoice4u') {
    return t('settings.tax.invoice4u_handles_vat', {
      defaultValue:
        'Invoice4U issues tax documents with card payments; VAT is handled in Invoice4U.',
    });
  }
  return t('settings.tax.grow_handles_vat');
}

/** Invoice4U CreditCardCompanyType values (SPIKE-ADR D4). */
export const INVOICE4U_CLEARING_COMPANY_OPTIONS = [
  { value: '12', labelKey: 'settings.invoice4u.clearing_upay', defaultLabel: 'UPay' },
  { value: '7', labelKey: 'settings.invoice4u.clearing_meshulam', defaultLabel: 'Meshulam' },
  { value: '15', labelKey: 'settings.invoice4u.clearing_yaadsarig', defaultLabel: 'YaadSarig' },
  { value: '6', labelKey: 'settings.invoice4u.clearing_cardcom', defaultLabel: 'Cardcom' },
] as const;

export const INVOICE4U_DEFAULT_CLEARING_COMPANY = '7';
