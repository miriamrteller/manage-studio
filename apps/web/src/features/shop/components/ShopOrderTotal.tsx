import { useTranslation } from 'react-i18next';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import type { ShopOrder } from '../services/shopOrdersService';

/** What the order costs after a client discount or coupon, with the discount beside it. */
export function ShopOrderTotal({ order, className }: { order: Pick<ShopOrder, 'total_minor' | 'discount_minor' | 'currency'>; className?: string }) {
  const { t, i18n } = useTranslation();
  const off = Math.max(0, order.discount_minor ?? 0);
  const money = (minor: number) => <bdi>{formatMinor(minor, order.currency, i18n.language)}</bdi>;
  return (
    <span className={className}>
      {money(Math.max(0, order.total_minor - off))}
      {off > 0 && (
        <span className="ms-1 text-xs font-normal text-muted-foreground">
          ({t('studio_shop.orders.discount_off', { amount: formatMinor(off, order.currency, i18n.language) })})
        </span>
      )}
    </span>
  );
}
