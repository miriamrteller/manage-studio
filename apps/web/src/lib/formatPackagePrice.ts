import type { TFunction } from 'i18next';
import { formatCurrency } from '@shared/format';

export type PackagePriceDisplay = 'show' | 'from' | 'on_request';

/**
 * A package's price as clients see it: the price, "From ₪X", or "Price on request".
 * Returns null when there is nothing to show (no price set and the price is shown as is).
 */
export function formatPackagePrice(
  t: TFunction,
  priceMinor: number | null,
  display: PackagePriceDisplay,
  currency: string,
  locale: string,
): string | null {
  if (display === 'on_request') return t('scheduling.price_display.on_request_label');
  if (priceMinor === null || priceMinor <= 0) return null;
  const amount = formatCurrency(priceMinor, currency, locale);
  return display === 'from' ? t('scheduling.price_display.from_label', { amount }) : amount;
}
