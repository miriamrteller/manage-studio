import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allPhotosIsBetter,
  photoCartGrandTotal,
  photoCartTotal,
  photoProductLabel,
  type PhotoShopPrices,
} from '@shared/photoShop';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePhotoShopEnabled } from '../hooks/usePhotoShop';
import {
  ClientPhotoShopError,
  ClientPhotoShopService,
  type ClientGalleryPhoto,
  type ClientPhotoGallery,
  type ClientPhotoOrder,
  type PhotoPayBy,
  type PhotoProductLine,
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
  // Once, when none of the photos load: ask for fresh links from the gallery.
  const [refresh, setRefresh] = useState(false);
  const gallery = useQuery({
    queryKey: [...galleryKey(engagementId), refresh ? 'refresh' : 'saved'],
    queryFn: () => ClientPhotoShopService.gallery(engagementId, refresh),
    enabled,
  });
  if (!enabled || !gallery.data) return null;
  return (
    <ShopBody
      key={refresh ? 'refresh' : 'saved'}
      engagementId={engagementId}
      data={gallery.data}
      caption={caption}
      onNoPhotoLoaded={refresh ? undefined : () => setRefresh(true)}
    />
  );
}

/**
 * Photo shop → Preview: the studio sees a shoot's shop exactly as its client does and can
 * pick photos, see the total and press the buttons. Only placing the order is skipped,
 * because a real order would land on the client's record and ask them to pay.
 * Sample photos while the shoot's gallery isn't ready.
 */
export function PhotoShopPreview({ engagementId }: { engagementId: string }) {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const preview = useQuery({
    queryKey: ['photo-shop-preview', engagementId, refresh ? 'refresh' : 'saved'],
    queryFn: () => ClientPhotoShopService.preview(engagementId, refresh),
    retry: false,
  });
  if (preview.isLoading) return <p className="text-sm text-gray-600">{t('common.loading')}</p>;
  if (preview.error) {
    const code = preview.error instanceof ClientPhotoShopError ? preview.error.code : 'server_error';
    return (
      <p role="status" className="text-sm text-gray-700">
        {code === 'no_shop' ? t('photo_shop_admin.preview.no_shop') : t('photo_shop_admin.preview.failed')}
      </p>
    );
  }
  if (!preview.data) return null;
  return (
    <ShopBody
      key={refresh ? 'refresh' : 'saved'}
      engagementId={engagementId}
      data={preview.data}
      preview
      onNoPhotoLoaded={refresh ? undefined : () => setRefresh(true)}
      caption={
        <>
          <p className="text-sm text-gray-600">
            {t('photo_shop_admin.preview.note')}
            {preview.data.sample ? ` ${t('photo_shop_admin.preview.sample')}` : ''}
          </p>
          {preview.data.smugmugConnection === 'lost' && (
            <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t('photo_shop_admin.preview.smugmug_lost')}
            </p>
          )}
        </>
      }
    />
  );
}

function ShopBody({
  engagementId,
  data,
  caption,
  preview = false,
  onNoPhotoLoaded,
}: {
  engagementId: string;
  data: ClientPhotoGallery;
  caption?: ReactNode;
  /** Called once when every photo failed to load (to ask for fresh links). */
  onNoPhotoLoaded?: () => void;
  /** The studio's preview: everything works as for the client, but no order is placed. */
  preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingId = useId();
  const termsId = useId();
  const [cart, setCart] = useState<Set<string>>(new Set());
  // Prints and other products, one line each (the same photo may have several).
  const [lines, setLines] = useState<PhotoProductLine[]>([]);
  const [doneMessage, setDoneMessage] = useState<'free' | 'cash' | null>(null);
  // Preview: what would have happened, instead of placing an order.
  const [tried, setTried] = useState<'card' | 'cash' | 'free' | null>(null);
  // Paying the studio directly is chosen first (owner, 19 Nov 2026). Card is offered only
  // when the studio has switched card payments on.
  const cardOn = data.shop.card_payments === true;
  const [chosenPayBy, setPayBy] = useState<PhotoPayBy>('cash');
  const payBy: PhotoPayBy = cardOn ? chosenPayBy : 'cash';
  const payById = useId();
  const { shop, photos } = data;
  const lang = i18n.language;
  const money = (minor: number) => formatMinor(minor, shop.currency, lang);

  const bought = useMemo(() => new Set(shop.bought_image_keys), [shop.bought_image_keys]);
  const awaiting = useMemo(() => new Set(shop.awaiting_image_keys), [shop.awaiting_image_keys]);
  const cashOrdered = useMemo(() => new Set(shop.cash_image_keys ?? []), [shop.cash_image_keys]);
  // The client's own unpaid card cart is replaced by a new one, so those photos stay pickable.
  // Photos sent in to pay in cash stay with that order.
  // A preview that doesn't load (e.g. hidden or private in SmugMug) is left out, never a blank tile.
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shown = photos.filter((p) => !broken.has(p.key));
  const available = shown.filter((p) => !bought.has(p.key) && !cashOrdered.has(p.key));
  const noPhotoLoaded = photos.length > 0 && shown.length === 0;
  useEffect(() => {
    if (noPhotoLoaded) onNoPhotoLoaded?.();
  }, [noPhotoLoaded, onNoPhotoLoaded]);

  const prices: PhotoShopPrices = {
    includedPhotos: shop.included_photos,
    includedUsed: shop.included_photos - shop.included_left,
    pricePerPhotoMinor: shop.price_per_photo_minor,
    allPhotosPriceMinor: shop.all_photos_price_minor,
    keptMinor: shop.spent_minor,
  };
  const products = useMemo(() => shop.products ?? [], [shop.products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const linePrices = lines.map((l) => productById.get(l.productId)?.price_minor ?? 0);
  const total = photoCartGrandTotal(prices, cart.size, linePrices);
  const allTotal = photoCartGrandTotal(prices, available.length, linePrices, true);
  const allDigital = photoCartTotal(prices, available.length, true);
  const suggestAll = allPhotosIsBetter(prices, cart.size, available.length);

  const order = useMutation({
    mutationFn: (allPhotos: boolean) =>
      lines.length > 0
        ? ClientPhotoShopService.order(engagementId, allPhotos ? [] : [...cart], allPhotos, payBy, lines)
        : ClientPhotoShopService.order(engagementId, [...cart], allPhotos, payBy),
    onMutate: () => setDoneMessage(null),
    onSuccess: async (placed) => {
      setCart(new Set());
      setLines([]);
      if (placed.payToken && !placed.payByCash) {
        navigate(`/pay/${placed.payToken}`);
        return;
      }
      setDoneMessage(placed.payByCash ? 'cash' : 'free');
      await queryClient.invalidateQueries({ queryKey: galleryKey(engagementId) });
    },
  });

  const place = (allPhotos: boolean) => {
    if (!preview) {
      order.mutate(allPhotos);
      return;
    }
    const minor = allPhotos ? allTotal.totalMinor : total.totalMinor;
    setTried(minor <= 0 ? 'free' : payBy);
  };

  const addLine = (imageKey: string, productId: string) => {
    if (!productById.has(productId)) return;
    setTried(null);
    setLines((prev) => [...prev, { imageKey, productId }]);
  };
  /** Takes one copy of this product of this photo off the cart (the last one added). */
  const removeOne = (imageKey: string, productId: string) => {
    setTried(null);
    setLines((prev) => {
      const at = prev.map((l) => l.imageKey === imageKey && l.productId === productId).lastIndexOf(true);
      return at < 0 ? prev : prev.filter((_, i) => i !== at);
    });
  };
  // The photo open large with its buying options (side panel; a bottom sheet on phones).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openIndex = openKey ? shown.findIndex((p) => p.key === openKey) : -1;
  const openPhoto = openIndex >= 0 ? shown[openIndex] : null;
  const withOptions = shop.open && products.length > 0;

  /** A preview that doesn't load is left out, and so is anything of it in the cart. */
  const dropPhoto = (key: string) => {
    setBroken((prev) => new Set(prev).add(key));
    setLines((prev) => (prev.some((l) => l.imageKey === key) ? prev.filter((l) => l.imageKey !== key) : prev));
    setCart((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggle = (key: string) => {
    setTried(null);
    setCart((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

      {tried && (
        <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {t('photo_shop_admin.preview.tried')}{' '}
          {tried === 'card'
            ? t('photo_shop_admin.preview.tried_card')
            : t('photo_shop_admin.preview.tried_shows', {
                message: t(tried === 'cash' ? 'pages.client_portal.photo_shop.ordered_cash' : 'pages.client_portal.photo_shop.ordered_free'),
              })}
        </p>
      )}

      {doneMessage && (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {doneMessage === 'cash'
            ? t('pages.client_portal.photo_shop.ordered_cash')
            : t('pages.client_portal.photo_shop.ordered_free')}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {shown.map((p) => {
          const isBought = bought.has(p.key);
          const isCashOrdered = !isBought && cashOrdered.has(p.key);
          const inCart = cart.has(p.key);
          return (
            <li key={p.key} className="space-y-1">
              {withOptions ? (
                <button
                  type="button"
                  className="block w-full rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={t('pages.client_portal.photo_shop.open_options', { name: p.fileName })}
                  onClick={() => setOpenKey(p.key)}
                >
                  <PhotoImg photo={p} alt="" onBroken={() => dropPhoto(p.key)} />
                </button>
              ) : (
                <PhotoImg
                  photo={p}
                  alt={t('pages.client_portal.photo_shop.photo_alt', { name: p.fileName })}
                  onBroken={() => dropPhoto(p.key)}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="truncate text-gray-600" dir="ltr">{p.fileName}</span>
                {isBought ? (
                  <Badge variant="success">{t('pages.client_portal.photo_shop.bought')}</Badge>
                ) : isCashOrdered ? (
                  <Badge variant="secondary">{t('pages.client_portal.photo_shop.cash_ordered')}</Badge>
                ) : (
                  shop.open && (
                    <Button
                      size="sm"
                      variant={inCart ? 'primary' : 'outline'}
                      aria-pressed={inCart}
                      onClick={() => toggle(p.key)}
                    >
                      {products.length === 0
                        ? inCart ? t('pages.client_portal.photo_shop.in_cart') : t('pages.client_portal.photo_shop.add')
                        : inCart
                          ? t('pages.client_portal.photo_shop.digital_chosen')
                          : shop.price_per_photo_minor != null
                            ? t('pages.client_portal.photo_shop.digital_price', { price: money(shop.price_per_photo_minor) })
                            : t('pages.client_portal.photo_shop.digital')}
                    </Button>
                  )
                )}
              </div>
              {withOptions && (
                <button
                  type="button"
                  className="text-xs font-medium underline"
                  onClick={() => setOpenKey(p.key)}
                >
                  {lines.some((l) => l.imageKey === p.key)
                    ? t('pages.client_portal.photo_shop.prints_chosen', { count: lines.filter((l) => l.imageKey === p.key).length })
                    : t('pages.client_portal.photo_shop.see_prints')}
                </button>
              )}
              {!isBought && !isCashOrdered && awaiting.has(p.key) && (
                <p className="text-xs text-gray-500">{t('pages.client_portal.photo_shop.awaiting')}</p>
              )}
            </li>
          );
        })}
      </ul>

      {openPhoto && (
        <PhotoOptionsPanel
          photo={openPhoto}
          position={{ index: openIndex, count: shown.length }}
          onClose={() => setOpenKey(null)}
          onMove={(step) => setOpenKey(shown[(openIndex + step + shown.length) % shown.length].key)}
          digital={
            bought.has(openPhoto.key)
              ? { state: 'bought' }
              : cashOrdered.has(openPhoto.key)
                ? { state: 'cash_ordered' }
                : {
                    state: cart.has(openPhoto.key) ? 'in_cart' : 'available',
                    price: shop.price_per_photo_minor != null ? money(shop.price_per_photo_minor) : null,
                    onToggle: () => toggle(openPhoto.key),
                  }
          }
          products={products.map((pr) => ({
            id: pr.id,
            label: photoProductLabel(pr, lang),
            price: money(pr.price_minor),
            count: lines.filter((l) => l.imageKey === openPhoto.key && l.productId === pr.id).length,
          }))}
          onAdd={(productId) => addLine(openPhoto.key, productId)}
          onRemove={(productId) => removeOne(openPhoto.key, productId)}
          cartSummary={[
            t('pages.client_portal.photo_shop.cart_count', { count: cart.size }),
            lines.length > 0 ? t('pages.client_portal.photo_shop.cart_prints', { count: lines.length }) : null,
            total.problem === null ? money(total.totalMinor) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      )}

      {noPhotoLoaded && !onNoPhotoLoaded && (
        <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {preview ? t('photo_shop_admin.preview.photos_failed') : t('pages.client_portal.photo_shop.photos_failed')}
        </p>
      )}

      {shop.open && (available.length > 0 || products.length > 0) && (
        <div className="space-y-3 rounded-md border bg-gray-50 p-3" aria-live="polite">
          <p className="text-sm">
            {t('pages.client_portal.photo_shop.cart_count', { count: cart.size })}
            {lines.length > 0 && <> · {t('pages.client_portal.photo_shop.cart_prints', { count: lines.length })}</>}
            {total.digital.includedCount > 0 && <> · {t('pages.client_portal.photo_shop.cart_included', { count: total.digital.includedCount })}</>}
            {total.problem === null && <> · <strong>{money(total.totalMinor)}</strong></>}
          </p>
          {total.problem === 'no_price' && (
            <p className="text-sm text-gray-600">{t('pages.client_portal.photo_shop.no_price')}</p>
          )}
          {suggestAll && allDigital.problem === null && (
            <p className="text-sm text-gray-700">
              {t('pages.client_portal.photo_shop.suggest_all', { count: available.length, price: money(allDigital.totalMinor) })}
            </p>
          )}
          {cardOn ? (
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium" id={payById}>{t('pages.client_portal.photo_shop.pay_how')}</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name={payById} value="card" checked={payBy === 'card'} onChange={() => { setPayBy('card'); setTried(null); }} />
                  {t('pages.client_portal.photo_shop.pay_card')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={payById} value="cash" checked={payBy === 'cash'} onChange={() => { setPayBy('cash'); setTried(null); }} />
                  {t('pages.client_portal.photo_shop.pay_cash')}
                </label>
              </div>
            </fieldset>
          ) : (
            <p className="text-sm">{t('pages.client_portal.photo_shop.pay_direct_only')}</p>
          )}
          <p id={termsId} className="text-xs text-gray-500">{t('pages.client_portal.photo_shop.terms')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={total.problem !== null}
              isLoading={order.isPending && order.variables === false}
              aria-describedby={termsId}
              onClick={() => place(false)}
            >
              {total.totalMinor <= 0
                ? t('pages.client_portal.photo_shop.take_free')
                : payBy === 'cash'
                  ? t('pages.client_portal.photo_shop.send_cash', { price: money(total.totalMinor) })
                  : t('pages.client_portal.photo_shop.pay', { price: money(total.totalMinor) })}
            </Button>
            {available.length > 0 && allDigital.problem === null && shop.all_photos_price_minor != null && (
              <Button
                variant={suggestAll ? 'primary' : 'outline'}
                isLoading={order.isPending && order.variables === true}
                aria-describedby={termsId}
                onClick={() => place(true)}
              >
                {t(
                  `pages.client_portal.photo_shop.${lines.length > 0 ? 'buy_all_prints' : 'buy_all'}${payBy === 'cash' && allTotal.totalMinor > 0 ? '_cash' : ''}`,
                  { count: available.length, price: money(allTotal.totalMinor) },
                )}
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

function PhotoImg({
  photo,
  alt,
  onBroken,
  large = false,
}: {
  photo: ClientGalleryPhoto;
  alt: string;
  onBroken?: () => void;
  large?: boolean;
}) {
  return (
    <img
      src={photo.previewUrl}
      alt={alt}
      loading={large ? undefined : 'lazy'}
      referrerPolicy="no-referrer"
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onError={onBroken}
      className={
        large
          ? 'max-h-[45vh] w-full select-none rounded object-contain sm:max-h-[75vh]'
          : 'aspect-[4/3] w-full select-none rounded object-cover'
      }
    />
  );
}

type DigitalOption =
  | { state: 'bought' | 'cash_ordered' }
  | { state: 'available' | 'in_cart'; price: string | null; onToggle: () => void };

/**
 * One photo open large with every way to buy it (owner, 22 Nov 2026: "on the side"):
 * the options sit beside the photo on a wide screen and slide up under it on a phone.
 * Digital file on/off, each print with − and + for how many, arrows to the next photo.
 */
function PhotoOptionsPanel({
  photo,
  position,
  onClose,
  onMove,
  digital,
  products,
  onAdd,
  onRemove,
  cartSummary,
}: {
  photo: ClientGalleryPhoto;
  position: { index: number; count: number };
  onClose: () => void;
  onMove: (step: 1 | -1) => void;
  digital: DigitalOption;
  products: { id: string; label: string; price: string; count: number }[];
  onAdd: (productId: string) => void;
  onRemove: (productId: string) => void;
  cartSummary: string;
}) {
  const { t } = useTranslation();
  return (
    <BaseDialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-[var(--z-modal)] bg-black/60" />
        <BaseDialog.Popup
          className="fixed inset-x-0 bottom-0 z-[var(--z-modal)] max-h-[92vh] overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(64rem,95vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_18rem]">
            <div className="space-y-2">
              <PhotoImg
                photo={photo}
                alt={t('pages.client_portal.photo_shop.photo_alt', { name: photo.fileName })}
                large
              />
              <div className="flex items-center justify-between gap-2 text-sm">
                <Button size="sm" variant="outline" onClick={() => onMove(-1)} disabled={position.count < 2}>
                  {t('pages.client_portal.photo_shop.previous_photo')}
                </Button>
                <span className="text-gray-600" dir="ltr">
                  {photo.fileName} · {position.index + 1}/{position.count}
                </span>
                <Button size="sm" variant="outline" onClick={() => onMove(1)} disabled={position.count < 2}>
                  {t('pages.client_portal.photo_shop.next_photo')}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <BaseDialog.Title className="text-lg font-semibold text-gray-900">
                {t('pages.client_portal.photo_shop.options_title')}
              </BaseDialog.Title>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span>
                    {t('pages.client_portal.photo_shop.digital')}
                    {'price' in digital && digital.price && <> · {digital.price}</>}
                  </span>
                  {digital.state === 'bought' ? (
                    <Badge variant="success">{t('pages.client_portal.photo_shop.bought')}</Badge>
                  ) : digital.state === 'cash_ordered' ? (
                    <Badge variant="secondary">{t('pages.client_portal.photo_shop.cash_ordered')}</Badge>
                  ) : (
                    'onToggle' in digital && <Button
                      size="sm"
                      variant={digital.state === 'in_cart' ? 'primary' : 'outline'}
                      aria-pressed={digital.state === 'in_cart'}
                      onClick={digital.onToggle}
                    >
                      {digital.state === 'in_cart'
                        ? t('pages.client_portal.photo_shop.added')
                        : t('pages.client_portal.photo_shop.add_one')}
                    </Button>
                  )}
                </li>
                {products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span>
                      {p.label} · {p.price}
                    </span>
                    <span className="flex items-center gap-1">
                      {p.count > 0 && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={t('pages.client_portal.photo_shop.remove_one', { name: p.label })}
                            onClick={() => onRemove(p.id)}
                          >
                            −
                          </Button>
                          <span className="min-w-[1.5rem] text-center font-medium" aria-live="polite">{p.count}</span>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant={p.count > 0 ? 'primary' : 'outline'}
                        aria-label={t('pages.client_portal.photo_shop.add_named', { name: p.label })}
                        onClick={() => onAdd(p.id)}
                      >
                        +
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-700" aria-live="polite">{cartSummary}</p>
              <BaseDialog.Close render={<Button variant="primary" />}>
                {t('pages.client_portal.photo_shop.options_done')}
              </BaseDialog.Close>
            </div>
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
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
            {[
              o.photo_count > 0 ? t('pages.client_portal.photo_shop.order_photos', { count: o.photo_count }) : null,
              (o.product_count ?? 0) > 0 ? t('pages.client_portal.photo_shop.order_prints', { count: o.product_count }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}{' '}
            · {formatMinor(o.total_minor, o.currency, i18n.language)}
          </span>
          {o.delivery_url ? (
            <a href={o.delivery_url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {t('pages.client_portal.photo_shop.download')}
            </a>
          ) : o.status === 'awaiting_payment' && o.pay_by_cash ? (
            <span className="flex flex-wrap items-center gap-2 text-gray-600">
              {t('pages.client_portal.photo_shop.cash_waiting')}
              {o.pay_token && (
                <a href={`/pay/${o.pay_token}`} className="font-medium underline">
                  {t('pages.client_portal.photo_shop.pay_online_instead')}
                </a>
              )}
            </span>
          ) : o.status === 'awaiting_payment' && o.pay_token ? (
            <a href={`/pay/${o.pay_token}`} className="font-medium underline">
              {t('pages.client_portal.photo_shop.pay_now')}
            </a>
          ) : o.status === 'delivered' ? (
            <span className="text-gray-600">{t('pages.client_portal.photo_shop.sent')}</span>
          ) : (
            <span className="text-gray-600">
              {t(o.photo_count === 0 ? 'pages.client_portal.photo_shop.preparing_prints' : 'pages.client_portal.photo_shop.preparing')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
