import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJobPhotoShop, useJobPhotoShopPhotos, usePhotoShopEnabled } from '../hooks/usePhotoShop';
import { JobPhotoShopSource } from './JobPhotoShopSource';
import { PhotoShopLinkError, PhotoShopLinkService, shopLinkMessage, type PhotoShopLink } from '../services/photoShopLinkService';
import {
  isDeliveryLink,
  majorToMinor,
  minorToMajor,
  type JobPhotoShop,
  type PhotoOrder,
  type PhotoOrderStatus,
  type ShopPhoto,
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
 * Shoot page: the photo shop. The studio picks the shoot's SmugMug gallery (or uploads
 * watermarked copies) and
 * clients buy downloads; prices are prefilled from the package and the studio defaults and
 * stay editable. Paid orders show each bought photo's thumbnail and file name, and are
 * delivered by pasting a download link or marked as sent.
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
  const { photos } = useJobPhotoShopPhotos(engagementId);
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
        <p>{summary.join(' · ')}</p>
        {perPhoto == null && (
          <p className="text-muted-foreground">{t('pages.jobs.photo_shop.no_price_hint')}</p>
        )}
      </div>

      <JobPhotoShopSource engagementId={engagementId} shop={data} />

      <p className="text-sm">
        <Link to={`/admin/jobs/${engagementId}?tab=client`} className="font-medium underline">
          {t('photo_shop_admin.preview.open_from_shoot')}
        </Link>
      </p>

      {data.gallery_key && <SendShopLink engagementId={engagementId} />}

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

      <PhotoOrders engagementId={engagementId} orders={orders.data ?? []} loading={orders.isLoading}
        thumbs={thumbnailMap(data, photos.data ?? [])} />
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

/** image_key → thumbnail: the uploaded previews, or the checked SmugMug gallery's photos. */
function thumbnailMap(shop: JobPhotoShop, uploads: ShopPhoto[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of uploads) if (p.url) map.set(p.id, p.url);
  for (const p of shop.smugmug_photos ?? []) if (p.previewUrl) map.set(p.key, p.previewUrl);
  return map;
}

function PhotoOrders({
  engagementId,
  orders,
  loading,
  thumbs,
}: {
  engagementId: string;
  orders: PhotoOrder[];
  loading: boolean;
  thumbs: Map<string, string>;
}) {
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
            <PhotoOrderRow key={o.id} engagementId={engagementId} order={o} thumbs={thumbs} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PhotoOrderRow({ engagementId, order, thumbs }: { engagementId: string; order: PhotoOrder; thumbs: Map<string, string> }) {
  const { t, i18n } = useTranslation();
  const { deliver, markSent, recordCash } = useJobPhotoShop(engagementId, false);
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

      {order.status === 'awaiting_payment' && order.pay_by_cash && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">{t('pages.jobs.photo_shop.paying_cash')}</span>
          {order.job_payment_request_id && (
            <Button size="sm" variant="primary" isLoading={recordCash.isPending}
              onClick={() => recordCash.mutate(order.job_payment_request_id as string)}>
              {t('pages.jobs.photo_shop.record_cash')}
            </Button>
          )}
          {recordCash.error && <p role="alert" className="w-full text-error">{(recordCash.error as Error).message}</p>}
        </div>
      )}

      <details open={order.status === 'paid' || (order.status === 'awaiting_payment' && order.pay_by_cash === true)}>
        <summary className="cursor-pointer text-muted-foreground">{t('pages.jobs.photo_shop.order_photos_list')}</summary>
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" dir="ltr">
          {order.items.map((i) => (
            <li key={i.image_key} className="space-y-1">
              {thumbs.get(i.image_key) ? (
                <img src={thumbs.get(i.image_key)} alt={i.file_name} loading="lazy"
                  className="aspect-square w-full rounded object-cover" />
              ) : (
                <div aria-hidden="true" className="aspect-square w-full rounded bg-muted" />
              )}
              <p className="break-all text-xs">{i.file_name}</p>
            </li>
          ))}
        </ul>
      </details>

      {order.status === 'delivered' && !order.delivery_url && !editing && (
        <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {t('pages.jobs.photo_shop.marked_sent')}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('pages.jobs.photo_shop.add_link')}
          </Button>
        </p>
      )}

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
          {order.status === 'paid' && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {t('pages.jobs.photo_shop.mark_sent_hint')}
              <Button size="sm" variant="secondary" isLoading={markSent.isPending}
                onClick={() => markSent.mutate(order.id, { onSuccess: () => setEditing(false) })}>
                {t('pages.jobs.photo_shop.mark_sent')}
              </Button>
            </p>
          )}
          {deliver.error && <p role="alert" className="text-error">{(deliver.error as Error).message}</p>}
          {markSent.error && <p role="alert" className="text-error">{(markSent.error as Error).message}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * "Email shop link to client" (owner, 13 Nov 2026: one button): OpalSwift makes the
 * 3-day link and emails it from the studio. WhatsApp or copy stay as a smaller choice.
 */
function SendShopLink({ engagementId }: { engagementId: string }) {
  const { t, i18n } = useTranslation();
  const [link, setLink] = useState<(PhotoShopLink & { emailed?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (how: 'email' | 'link') => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setLink(how === 'email' ? await PhotoShopLinkService.email(engagementId) : await PhotoShopLinkService.create(engagementId));
    } catch (e) {
      setError(e instanceof PhotoShopLinkError && e.code === 'no_email'
        ? t('pages.jobs.photo_shop.link_no_email')
        : t('pages.jobs.photo_shop.link_error'));
    } finally {
      setBusy(false);
    }
  };

  const message = link ? shopLinkMessage(t('pages.jobs.photo_shop.link_message'), link.url) : '';
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const until = link ? formatDueDate(link.expiresAt, i18n.language) : '';

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" isLoading={busy} onClick={() => void run('email')}>
          {t('pages.jobs.photo_shop.email_link')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run('link')}>
          {t('pages.jobs.photo_shop.link_other_way')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('pages.jobs.photo_shop.send_link_hint')}</p>
      {link && (
        <div className="space-y-2 rounded-md border p-3" aria-live="polite">
          {link.emailed ? (
            <p>{t('pages.jobs.photo_shop.link_emailed', { email: link.email, date: until })}</p>
          ) : (
            <p>
              {link.emailed === false
                ? t('pages.jobs.photo_shop.link_not_emailed')
                : t('pages.jobs.photo_shop.link_ready', { email: link.email, date: until })}
            </p>
          )}
          <p dir="ltr" className="break-all font-mono text-xs">{link.url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={copy}>
              {copied ? t('pages.jobs.photo_shop.link_copied') : t('pages.jobs.photo_shop.link_copy')}
            </Button>
            <Button size="sm" variant="secondary"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')}>
              {t('pages.jobs.photo_shop.link_whatsapp')}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  );
}
