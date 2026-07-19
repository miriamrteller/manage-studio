import type { TFunction } from 'i18next';
import { formatCurrency } from '@shared/format';

export type OfferingBillingFields = {
  billing_mode?: string | null;
  billing_interval?: string | null;
};

/** Format price; append "/ month" or "(one-time)" from billing fields when present. */
export function formatOfferingPrice(
  t: TFunction,
  amountMinor: number,
  currency: string,
  locale: string,
  billing?: OfferingBillingFields | null,
): string {
  const amount = formatCurrency(amountMinor, currency, locale);
  if (billing?.billing_mode === 'recurring' && billing?.billing_interval === 'monthly') {
    return t('billing.price_per_month', { amount, defaultValue: '{{amount}} / month' });
  }
  if (billing?.billing_mode === 'one_time') {
    return t('billing.price_one_time', { amount, defaultValue: '{{amount}} (one-time)' });
  }
  return amount;
}
