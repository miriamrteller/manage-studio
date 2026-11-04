import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJobPhotoShop, usePhotoShopEnabled } from '../hooks/usePhotoShop';
import {
  isDeliveryLink,
  majorToMinor,
  minorToMajor,
  type JobPhotoShop,
  type PhotoOrder,
  type PhotoOrderStatus,
} from '../services/photoShopService';
import { formatDueDate, formatMinor } from '../lib/jobPaymentFormat';

/** yyyy-mm-dd in the browser's calendar. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** End of that day in the browser's calendar, as ISO. */
function fromDateInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

interface Draft {
  included: string;
  perPhoto: string;
  allPhotos: string;
  closes: string;
}

function draftFrom(shop: JobPhotoShop): Draft {
  return {
    included: String(shop.included_photos),
    perPhoto: minorToMajor(shop.price_per_photo_minor),
    allPhotos: minorToMajor(shop.all_photos_price_minor),
    closes: toDateInput(shop.closes_at),
  };
}

const ORDER_BADGE: Record<PhotoOrderStatus, 'default' | 'secondary' | 'success' | 'destructive'> = {
  awaiting_payment: 'secondary',
  paid: 'default',
  delivered: 'success',
  cancelled: 'destructive',
  refunded: 'destructive',
};

/**
 * Shoot page: the photo shop. Clients buy downloads from the studio's own
 * gallery; prices are prefilled from the package and the studio defaults and
 * stay editable. Paid orders are delivered by pasting a download link.
 * Shown only to studios with the photo shop switched on.
 */
export function JobPhotoShopCard({ engagementId }: { engagementId: string }) {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <PhotoShopCardBody engagementId={engagementId} />;
}

function PhotoShopCardBody({ engagementId }: { engagementId: string }) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const { shop, orders, save } = useJobPhotoShop(engagementId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (shop.data && !draft) setDraft(draftFrom(shop.data));
  }, [shop.data, draft]);

  if (shop.isLoading || !draft) {
    return (
      <section className="card p-4" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-semibold">{t('pages.jobs.photo_shop.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </section>
    );
  }
  if (shop.error || !shop.data) {
    return (
      <section className="card p-4" aria-labelledby={headingId}>
        <h2 id={headingId} className="font-semibold">{t('pages.jobs.photo_shop.title')}</h2>
        <p role="alert" className="text-sm text-error">{(shop.error as Error | null)?.message ?? t('pages.jobs.error_generic')}</p>
      </section>
    );
  }

  const data = shop.data;
  const lang = i18n.language;
  const money = (minor: number) => formatMinor(minor, data.currency, lang);
  const included = Math.max(0, Math.floor(Number(draft.included) || 0));
  const perPhoto = majorToMinor(draft.perPhoto);
  const allPhotos = majorToMinor(draft.allPhotos);
  const closesAt = fromDateInput(draft.closes) ?? data.closes_at;

  const summary = [
    included > 0 ? t('pages.jobs.photo_shop.summary_included', { count: included }) : null,
    perPhoto != null ? t('pages.jobs.photo_shop.summary_per_photo', { price: money(perPhoto) }) : null,
    allPhotos != null ? t('pages.jobs.photo_shop.summary_all', { price: money(allPhotos) }) : null,
    t('pages.jobs.photo_shop.summary_open_until', { date: formatDueDate(closesAt, lang) }),
  ].filter(Boolean);

  const patch = (p: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...p } : d));
  };

  const onSave = () =>
    save.mutate(
      {
        included_photos: included,
        price_per_photo_minor: perPhoto,
        all_photos_price_minor: allPhotos,
        closes_at: closesAt,
      },
      { onSuccess: (next) => { setDraft(draftFrom(next)); setSaved(true); } },
    );

  return (
    <section className="card p-4 space-y-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-semibold">{t('pages.jobs.photo_shop.title')}</h2>
        <Badge variant="secondary">{t('pages.jobs.photo_shop.beta')}</Badge>
      </div>

      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">{t('pages.jobs.photo_shop.gallery')}: </span>
          {data.gallery_name ?? t('pages.jobs.photo_shop.gallery_none')}
        </p>
        {!data.gallery_key && <p className="text-muted-foreground">{t('pages.jobs.photo_shop.gallery_coming')}</p>}
        <p>{summary.join(' · ')}</p>
        {perPhoto == null && (
          <p className="text-muted-foreground">{t('pages.jobs.photo_shop.no_price_hint')}</p>
        )}
      </div>

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">{t('studio_setup.filled_for_you')}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{t('pages.jobs.photo_shop.filled_hint')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ShopField label={t('pages.jobs.photo_shop.included')} hint={t('pages.jobs.photo_shop.included_hint')}>
            {(id, hintId) => (
              <Input id={id} aria-describedby={hintId} type="number" min={0} inputMode="numeric"
                value={draft.included} onChange={(e) => patch({ included: e.target.value })} />
            )}
          </ShopField>
          <ShopField label={t('pages.jobs.photo_shop.per_photo', { currency: data.currency })}>
            {(id) => (
              <Input id={id} type="number" min={0} step="0.01" inputMode="decimal"
                value={draft.perPhoto} onChange={(e) => patch({ perPhoto: e.target.value })} />
            )}
          </ShopField>
          <ShopField label={t('pages.jobs.photo_shop.all_photos', { currency: data.currency })}
            hint={t('pages.jobs.photo_shop.all_photos_hint')}>
            {(id, hintId) => (
              <Input id={id} aria-describedby={hintId} type="number" min={0} step="0.01" inputMode="decimal"
                value={draft.allPhotos} onChange={(e) => patch({ allPhotos: e.target.value })} />
            )}
          </ShopField>
          <ShopField label={t('pages.jobs.photo_shop.open_until')} hint={t('pages.jobs.photo_shop.open_until_hint')}>
            {(id, hintId) => (
              <Input id={id} aria-describedby={hintId} type="date"
                value={draft.closes} onChange={(e) => patch({ closes: e.target.value })} />
            )}
          </ShopField>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="primary" isLoading={save.isPending} onClick={onSave}>
            {t('common.save')}
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {saved ? t('pages.jobs.photo_shop.saved') : !data.saved ? t('pages.jobs.photo_shop.not_saved_yet') : ''}
          </span>
        </div>
        {save.error && <p role="alert" className="mt-2 text-sm text-error">{(save.error as Error).message}</p>}
      </details>

      <PhotoOrders engagementId={engagementId} orders={orders.data ?? []} loading={orders.isLoading} />
    </section>
  );
}

function ShopField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string, hintId: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children(id, hintId)}
      {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PhotoOrders({ engagementId, orders, loading }: { engagementId: string; orders: PhotoOrder[]; loading: boolean }) {
  const { t } = useTranslation();
  if (loading) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t('pages.jobs.photo_shop.orders')}</h3>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pages.jobs.photo_shop.no_orders')}</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <PhotoOrderRow key={o.id} engagementId={engagementId} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PhotoOrderRow({ engagementId, order }: { engagementId: string; order: PhotoOrder }) {
  const { t, i18n } = useTranslation();
  const { deliver } = useJobPhotoShop(engagementId, false);
  const linkId = useId();
  const [link, setLink] = useState(order.delivery_url ?? '');
  const [editing, setEditing] = useState(order.status === 'paid');
  const canDeliver = order.status === 'paid' || order.status === 'delivered';
  const valid = isDeliveryLink(link);

  return (
    <li className="rounded-md border p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {formatDueDate(order.created_at, i18n.language)} ·{' '}
          {t('pages.jobs.photo_shop.order_photos', { count: order.photo_count })}
          {order.included_count > 0 && <> ({t('pages.jobs.photo_shop.order_included', { count: order.included_count })})</>}
          {' · '}
          {formatMinor(order.total_minor, order.currency, i18n.language)}
        </span>
        <Badge variant={ORDER_BADGE[order.status]}>{t(`pages.jobs.photo_shop.status.${order.status}`)}</Badge>
      </div>

      <details>
        <summary className="cursor-pointer text-muted-foreground">{t('pages.jobs.photo_shop.file_names')}</summary>
        <ul className="mt-1 list-disc ps-5" dir="ltr">
          {order.items.map((i) => (
            <li key={i.image_key}>{i.file_name}</li>
          ))}
        </ul>
      </details>

      {order.status === 'delivered' && !editing && order.delivery_url && (
        <p className="flex flex-wrap items-center gap-2">
          <a href={order.delivery_url} target="_blank" rel="noopener noreferrer" className="underline" dir="ltr">
            {order.delivery_url}
          </a>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('pages.jobs.photo_shop.change_link')}
          </Button>
        </p>
      )}

      {canDeliver && editing && (
        <div className="space-y-1">
          <label htmlFor={linkId} className="block font-medium">{t('pages.jobs.photo_shop.delivery_link')}</label>
          <div className="flex flex-wrap gap-2">
            <Input id={linkId} dir="ltr" type="url" inputMode="url" placeholder="https://"
              className="min-w-0 flex-1" value={link} onChange={(e) => setLink(e.target.value)}
              aria-describedby={`${linkId}-hint`} />
            <Button size="sm" variant="primary" disabled={!valid} isLoading={deliver.isPending}
              onClick={() => deliver.mutate({ orderId: order.id, url: link }, { onSuccess: () => setEditing(false) })}>
              {t('pages.jobs.photo_shop.send')}
            </Button>
          </div>
          <p id={`${linkId}-hint`} className="text-xs text-muted-foreground">{t('pages.jobs.photo_shop.delivery_hint')}</p>
          {deliver.error && <p role="alert" className="text-error">{(deliver.error as Error).message}</p>}
        </div>
      )}
    </li>
  );
}
