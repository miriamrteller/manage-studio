import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allPhotosIsBetter, photoCartTotal, type PhotoShopPrices } from '@shared/photoShop';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePhotoShopEnabled } from '../hooks/usePhotoShop';
import {
  ClientPhotoShopError,
  ClientPhotoShopService,
  type ClientPhotoGallery,
  type ClientPhotoOrder,
} from '../services/clientPhotoShopService';
import { formatDueDate, formatMinor } from '../lib/jobPaymentFormat';

const galleryKey = (id: string) => ['client-photo-shop', id] as const;

/**
 * "My shoots": the client buys downloads from the studio's gallery. Previews
 * only (watermarked by the gallery service); the studio delivers a download
 * link once paid. Hidden when the studio has no photo shop or the shoot no
 * gallery yet.
 */
export function ClientPhotoShop({ engagementId, caption }: { engagementId: string; caption?: ReactNode }) {
  const enabled = usePhotoShopEnabled();
  const gallery = useQuery({
    queryKey: galleryKey(engagementId),
    queryFn: () => ClientPhotoShopService.gallery(engagementId),
    enabled,
  });
  if (!enabled || !gallery.data) return null;
  return <ShopBody engagementId={engagementId} data={gallery.data} caption={caption} />;
}

function ShopBody({ engagementId, data, caption }: { engagementId: string; data: ClientPhotoGallery; caption?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingId = useId();
  const termsId = useId();
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [doneMessage, setDoneMessage] = useState(false);
  const { shop, photos } = data;
  const lang = i18n.language;
  const money = (minor: number) => formatMinor(minor, shop.currency, lang);

  const bought = useMemo(() => new Set(shop.bought_image_keys), [shop.bought_image_keys]);
  const awaiting = useMemo(() => new Set(shop.awaiting_image_keys), [shop.awaiting_image_keys]);
  // The client's own unpaid cart is replaced by a new one, so those photos stay pickable.
  const available = photos.filter((p) => !bought.has(p.key));

  const prices: PhotoShopPrices = {
    includedPhotos: shop.included_photos,
    includedUsed: shop.included_photos - shop.included_left,
    pricePerPhotoMinor: shop.price_per_photo_minor,
    allPhotosPriceMinor: shop.all_photos_price_minor,
    keptMinor: shop.spent_minor,
  };
  const total = photoCartTotal(prices, cart.size);
  const allTotal = photoCartTotal(prices, available.length, true);
  const suggestAll = allPhotosIsBetter(prices, cart.size, available.length);

  const order = useMutation({
    mutationFn: (allPhotos: boolean) => ClientPhotoShopService.order(engagementId, [...cart], allPhotos),
    onSuccess: async (placed) => {
      setCart(new Set());
      if (placed.payToken) {
        navigate(`/pay/${placed.payToken}`);
        return;
      }
      setDoneMessage(true);
      await queryClient.invalidateQueries({ queryKey: galleryKey(engagementId) });
    },
  });

  const toggle = (key: string) =>
    setCart((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const orderError = order.error instanceof ClientPhotoShopError ? order.error.code : order.error ? 'server_error' : null;

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <h3 id={headingId} className="text-lg font-semibold text-gray-900">{t('pages.client_portal.photo_shop.title')}</h3>
        {caption}
        <p className="text-sm text-gray-600">
          {[
            shop.included_left > 0 ? t('pages.client_portal.photo_shop.included_left', { count: shop.included_left }) : null,
            shop.price_per_photo_minor != null
              ? t('pages.client_portal.photo_shop.per_photo', { price: money(shop.price_per_photo_minor) })
              : null,
            shop.open
              ? t('pages.client_portal.photo_shop.open_until', { date: formatDueDate(shop.closes_at, lang) })
              : t('pages.client_portal.photo_shop.closed'),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <ClientPhotoOrders orders={shop.orders} />

      {doneMessage && (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {t('pages.client_portal.photo_shop.ordered_free')}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p) => {
          const isBought = bought.has(p.key);
          const inCart = cart.has(p.key);
          return (
            <li key={p.key} className="space-y-1">
              <img
                src={p.previewUrl}
                alt={t('pages.client_portal.photo_shop.photo_alt', { name: p.fileName })}
                loading="lazy"
                referrerPolicy="no-referrer"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="aspect-[4/3] w-full select-none rounded object-cover"
              />
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="truncate text-gray-600" dir="ltr">{p.fileName}</span>
                {isBought ? (
                  <Badge variant="success">{t('pages.client_portal.photo_shop.bought')}</Badge>
                ) : (
                  shop.open && (
                    <Button
                      size="sm"
                      variant={inCart ? 'primary' : 'outline'}
                      aria-pressed={inCart}
                      onClick={() => toggle(p.key)}
                    >
                      {inCart ? t('pages.client_portal.photo_shop.in_cart') : t('pages.client_portal.photo_shop.add')}
                    </Button>
                  )
                )}
              </div>
              {!isBought && awaiting.has(p.key) && (
                <p className="text-xs text-gray-500">{t('pages.client_portal.photo_shop.awaiting')}</p>
              )}
            </li>
          );
        })}
      </ul>

      {shop.open && available.length > 0 && (
        <div className="space-y-3 rounded-md border bg-gray-50 p-3" aria-live="polite">
          <p className="text-sm">
            {t('pages.client_portal.photo_shop.cart_count', { count: cart.size })}
            {total.includedCount > 0 && <> · {t('pages.client_portal.photo_shop.cart_included', { count: total.includedCount })}</>}
            {total.problem === null && <> · <strong>{money(total.totalMinor)}</strong></>}
          </p>
          {total.problem === 'no_price' && (
            <p className="text-sm text-gray-600">{t('pages.client_portal.photo_shop.no_price')}</p>
          )}
          {suggestAll && allTotal.problem === null && (
            <p className="text-sm text-gray-700">
              {t('pages.client_portal.photo_shop.suggest_all', { count: available.length, price: money(allTotal.totalMinor) })}
            </p>
          )}
          <p id={termsId} className="text-xs text-gray-500">{t('pages.client_portal.photo_shop.terms')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={total.problem !== null}
              isLoading={order.isPending && order.variables === false}
              aria-describedby={termsId}
              onClick={() => order.mutate(false)}
            >
              {total.totalMinor > 0
                ? t('pages.client_portal.photo_shop.pay', { price: money(total.totalMinor) })
                : t('pages.client_portal.photo_shop.take_free')}
            </Button>
            {allTotal.problem === null && shop.all_photos_price_minor != null && (
              <Button
                variant={suggestAll ? 'primary' : 'outline'}
                isLoading={order.isPending && order.variables === true}
                aria-describedby={termsId}
                onClick={() => order.mutate(true)}
              >
                {t('pages.client_portal.photo_shop.buy_all', { count: available.length, price: money(allTotal.totalMinor) })}
              </Button>
            )}
          </div>
          {orderError && (
            <p role="alert" className="text-sm text-red-700">
              {t(`pages.client_portal.photo_shop.errors.${orderError}`, {
                defaultValue: t('pages.client_portal.photo_shop.errors.server_error'),
              })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ClientPhotoOrders({ orders }: { orders: ClientPhotoOrder[] }) {
  const { t, i18n } = useTranslation();
  if (orders.length === 0) return null;
  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>
            {formatDueDate(o.created_at, i18n.language)} ·{' '}
            {t('pages.client_portal.photo_shop.order_photos', { count: o.photo_count })} ·{' '}
            {formatMinor(o.total_minor, o.currency, i18n.language)}
          </span>
          {o.delivery_url ? (
            <a href={o.delivery_url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {t('pages.client_portal.photo_shop.download')}
            </a>
          ) : o.status === 'awaiting_payment' && o.pay_token ? (
            <a href={`/pay/${o.pay_token}`} className="font-medium underline">
              {t('pages.client_portal.photo_shop.pay_now')}
            </a>
          ) : (
            <span className="text-gray-600">{t('pages.client_portal.photo_shop.preparing')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
