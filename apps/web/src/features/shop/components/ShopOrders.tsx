import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { useStudioShopOrders } from '../hooks/useStudioShop';
import { sizeLabel, type ShopOrder, type ShopOrderStatus } from '../services/shopOrdersService';

/** The order the studio works through: what to get ready first, then what waits for collection. */
const GROUPS: ShopOrderStatus[] = ['paid', 'ready', 'awaiting_payment', 'collected', 'cancelled'];

/**
 * Shop → Orders: families' orders and public Shop page orders (with the buyer's email and
 * phone). Paid orders are got ready, marked "Ready to collect" (the buyer gets an email),
 * then "Collected". A buyer paying the studio directly: "Record cash payment" marks it paid.
 * Unpaid orders can be cancelled, which gives their stock back.
 */
export function ShopOrders() {
  const { t } = useTranslation();
  const { orders, setStatus, cancel, recordCash } = useStudioShopOrders();
  const list = orders.data ?? [];

  if (orders.isLoading) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (orders.error) return <p role="alert" className="text-sm text-error">{t('studio_shop.errors.failed')}</p>;
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{t('studio_shop.orders.none')}</p>;

  return (
    <div className="space-y-6">
      {GROUPS.map((status) => {
        const group = list.filter((o) => o.status === status);
        if (group.length === 0) return null;
        return (
          <section key={status} aria-label={t(`studio_shop.orders.group.${status}`)} className="space-y-2">
            <h3 className="font-semibold">
              {t(`studio_shop.orders.group.${status}`)} ({group.length})
            </h3>
            <ul className="space-y-2">
              {group.map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  busy={
                    (setStatus.isPending && setStatus.variables?.orderId === o.id) ||
                    (cancel.isPending && cancel.variables === o.id) ||
                    (recordCash.isPending && recordCash.variables === o.request_id)
                  }
                  onStatus={(s) => setStatus.mutate({ orderId: o.id, status: s })}
                  onRecordCash={() => o.request_id && recordCash.mutate(o.request_id)}
                  onCancel={() => {
                    if (window.confirm(t('studio_shop.orders.cancel_confirm', { name: o.person_name }))) cancel.mutate(o.id);
                  }}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {setStatus.data && !setStatus.data.emailed && setStatus.variables?.status === 'ready' && (
        <p role="status" className="text-sm text-muted-foreground">{t('studio_shop.orders.not_emailed')}</p>
      )}
      {(setStatus.error || cancel.error || recordCash.error) && (
        <p role="alert" className="text-sm text-error">{t('studio_shop.errors.failed')}</p>
      )}
    </div>
  );
}

function OrderRow({
  order: o,
  busy,
  onStatus,
  onCancel,
  onRecordCash,
}: {
  order: ShopOrder;
  busy: boolean;
  onStatus: (s: 'ready' | 'collected') => void;
  onCancel: () => void;
  onRecordCash: () => void;
}) {
  const { t, i18n } = useTranslation();
  const oneSize = t('studio_shop.items.one_size');
  const date = new Intl.DateTimeFormat(i18n.language === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(o.created_at));
  return (
    <li className="card space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{o.person_name}</span>
          {o.ordered_by_name && o.ordered_by_name !== o.person_name && (
            <span className="text-muted-foreground">{t('studio_shop.orders.ordered_by', { name: o.ordered_by_name })}</span>
          )}
          <span className="text-muted-foreground">· {date}</span>
          {o.refunded && <Badge variant="secondary">{t('studio_shop.orders.refunded')}</Badge>}
          {o.guest && <Badge variant="secondary">{t('studio_shop.orders.from_shop_page')}</Badge>}
          {o.pay_by_cash && o.status === 'awaiting_payment' && (
            <Badge variant="secondary">{t('studio_shop.orders.paying_direct')}</Badge>
          )}
        </div>
        <span className="font-medium">{formatMinor(o.total_minor, o.currency, i18n.language)}</span>
      </div>
      {o.guest && (o.contact_email || o.contact_phone) && (
        <p className="text-muted-foreground" dir="ltr">
          {[o.contact_email, o.contact_phone].filter(Boolean).join(' · ')}
        </p>
      )}
      <ul className="text-muted-foreground">
        {o.lines.map((l, i) => (
          <li key={i}>
            {l.product_name} · {sizeLabel(l.variant_label, oneSize)}
            {l.quantity > 1 ? ` ×${l.quantity}` : ''}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {o.status === 'paid' && (
          <Button size="sm" variant="primary" isLoading={busy} onClick={() => onStatus('ready')}>
            {t('studio_shop.orders.mark_ready')}
          </Button>
        )}
        {(o.status === 'paid' || o.status === 'ready') && (
          <Button size="sm" variant={o.status === 'ready' ? 'primary' : 'outline'} isLoading={busy} onClick={() => onStatus('collected')}>
            {t('studio_shop.orders.mark_collected')}
          </Button>
        )}
        {o.status === 'awaiting_payment' && o.pay_by_cash && o.request_id && (
          <Button size="sm" variant="primary" isLoading={busy} onClick={onRecordCash}>
            {t('studio_shop.orders.record_cash')}
          </Button>
        )}
        {o.status === 'awaiting_payment' && (
          <Button size="sm" variant="ghost" isLoading={busy} onClick={onCancel}>
            {t('studio_shop.orders.cancel')}
          </Button>
        )}
      </div>
    </li>
  );
}
