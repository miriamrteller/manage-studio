import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { useStudioShopEnabled } from '../hooks/useStudioShop';
import { StudioShopService } from '../services/studioShopService';
import {
  ShopOrdersService,
  shopOrderErrorCode,
  sizeLabel,
  type CatalogueItem,
  type CatalogueVariant,
  type ShopOrder,
} from '../services/shopOrdersService';

export interface ShopPerson {
  id: string;
  name: string;
  /** Has an active class enrolment: orders are paid through it. */
  enrolled: boolean;
}

interface CartItem {
  item: CatalogueItem;
  variant: CatalogueVariant;
  quantity: number;
}

const catalogueKey = ['studio-shop', 'catalogue'] as const;
const myOrdersKey = ['studio-shop', 'my-orders'] as const;
const MAX_QTY = 20;

const available = (v: CatalogueVariant) => v.stock == null || v.stock > 0;
const maxFor = (v: CatalogueVariant) => (v.stock == null ? MAX_QTY : Math.min(MAX_QTY, v.stock));

/**
 * Client portal: "Studio shop" (beta). Families pick items and sizes, choose who they are
 * for (prefilled with the enrolled child), pay on the usual pay page through that child's
 * class, and collect at the studio. Their orders show where each one is. Renders nothing
 * while the studio doesn't have the shop, or has nothing on sale and no orders.
 */
export function PortalShop({ people }: { people: ShopPerson[] }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = useStudioShopEnabled();
  const catalogue = useQuery({ queryKey: catalogueKey, queryFn: () => ShopOrdersService.catalogue(), enabled });
  const orders = useQuery({ queryKey: myOrdersKey, queryFn: () => ShopOrdersService.myOrders(), enabled });

  const enrolled = useMemo(() => people.filter((p) => p.enrolled), [people]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [forPerson, setForPerson] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const forId = forPerson || enrolled[0]?.id || '';

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: catalogueKey });
    await queryClient.invalidateQueries({ queryKey: myOrdersKey });
  };

  const place = useMutation({
    mutationFn: () =>
      ShopOrdersService.placeOrder(
        cart.map((c) => ({ variantId: c.variant.id, quantity: c.quantity })),
        forId || null,
      ),
    onMutate: () => setMessage(null),
    onSuccess: async ({ payToken }) => {
      setCart([]);
      await refresh();
      if (payToken) navigate(`/pay/${payToken}`);
    },
    onError: async (err) => {
      const code = shopOrderErrorCode(err);
      setMessage(t(`portal_shop.errors.${['sold_out', 'item_not_found', 'needs_enrolment'].includes(code) ? code : 'failed'}`));
      if (code === 'sold_out' || code === 'item_not_found') await refresh();
    },
  });

  const items = catalogue.data ?? [];
  const myOrders = orders.data ?? [];
  if (!enabled || (items.length === 0 && myOrders.length === 0)) return null;

  const total = cart.reduce((sum, c) => sum + c.item.price_minor * c.quantity, 0);
  const currency = cart[0]?.item.currency ?? items[0]?.currency ?? 'ILS';
  const oneSize = t('studio_shop.items.one_size');

  const addToCart = (item: CatalogueItem, variant: CatalogueVariant, quantity: number) => {
    setMessage(null);
    setCart((prev) => {
      const at = prev.findIndex((c) => c.variant.id === variant.id);
      if (at < 0) return [...prev, { item, variant, quantity }];
      const next = [...prev];
      next[at] = { ...next[at], quantity: Math.min(maxFor(variant), next[at].quantity + quantity) };
      return next;
    });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div>
        <h3 id={`${id}-title`} className="text-lg font-semibold text-gray-900">
          {t('portal_shop.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('portal_shop.intro')}</p>
      </div>

      {myOrders.length > 0 && (
        <ul className="space-y-2" aria-label={t('portal_shop.orders_title')}>
          {myOrders.map((o) => (
            <MyOrder key={o.id} order={o} onChanged={refresh} />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} inCart={cart} onAdd={addToCart} />
          ))}
        </ul>
      )}

      {cart.length > 0 && (
        <div className="space-y-3 rounded-lg border p-4" aria-label={t('portal_shop.cart')}>
          <h4 className="font-medium">{t('portal_shop.cart')}</h4>
          <ul className="space-y-1 text-sm">
            {cart.map((c) => (
              <li key={c.variant.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {c.item.name} · {sizeLabel(c.variant.label, oneSize)}
                  {c.quantity > 1 ? ` ×${c.quantity}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  {formatMinor(c.item.price_minor * c.quantity, c.item.currency, i18n.language)}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('portal_shop.remove_label', { name: c.item.name })}
                    onClick={() => setCart((prev) => prev.filter((x) => x.variant.id !== c.variant.id))}
                  >
                    {t('portal_shop.remove')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>

          {enrolled.length > 1 ? (
            <label className="block text-sm">
              <span className="font-medium">{t('portal_shop.for')}</span>
              <select
                className="mt-1 block w-full rounded-md border px-2 py-1"
                value={forId}
                onChange={(e) => setForPerson(e.target.value)}
              >
                {enrolled.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : enrolled.length === 1 ? (
            <p className="text-sm">{t('portal_shop.for_one', { name: enrolled[0].name })}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('portal_shop.needs_enrolment')}</p>
          )}

          <p className="text-sm text-muted-foreground">{t('portal_shop.collect_note')}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              {t('portal_shop.total', { total: formatMinor(total, currency, i18n.language) })}
            </span>
            <Button variant="primary" isLoading={place.isPending} disabled={!forId} onClick={() => place.mutate()}>
              {t('portal_shop.pay')}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

function ItemCard({
  item,
  inCart,
  onAdd,
}: {
  item: CatalogueItem;
  inCart: CartItem[];
  onAdd: (item: CatalogueItem, variant: CatalogueVariant, quantity: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const oneSize = t('studio_shop.items.one_size');
  const firstAvailable = item.variants.find(available);
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const variant = item.variants.find((v) => v.id === variantId) ?? firstAvailable;
  const already = variant ? (inCart.find((c) => c.variant.id === variant.id)?.quantity ?? 0) : 0;
  const room = variant ? maxFor(variant) - already : 0;
  const soldOut = !firstAvailable;

  return (
    <li className="card flex gap-3 p-3 text-sm">
      {item.image_path ? (
        <img src={StudioShopService.imageUrl(item.image_path)} alt={item.name} className="h-24 w-24 shrink-0 rounded object-cover" />
      ) : (
        <div aria-hidden="true" className="h-24 w-24 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-medium">{item.name}</p>
          <p>{formatMinor(item.price_minor, item.currency, i18n.language)}</p>
          {item.description && <p className="text-muted-foreground">{item.description}</p>}
        </div>
        {soldOut ? (
          <p className="text-muted-foreground">{t('portal_shop.sold_out')}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {item.variants.length > 1 ? (
              <label className="text-xs">
                <span className="block">{t('studio_shop.items.size')}</span>
                <select
                  id={`${id}-size`}
                  className="mt-1 rounded-md border px-2 py-1 text-sm"
                  value={variant?.id ?? ''}
                  onChange={(e) => {
                    setVariantId(e.target.value);
                    setQuantity(1);
                  }}
                >
                  {item.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={!available(v)}>
                      {available(v)
                        ? sizeLabel(v.label, oneSize)
                        : t('studio_shop.items.size_sold_out', { size: sizeLabel(v.label, oneSize) })}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              variant &&
              variant.label !== 'One size' && <span className="text-xs">{sizeLabel(variant.label, oneSize)}</span>
            )}
            <label className="text-xs">
              <span className="block">{t('portal_shop.quantity')}</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, room)}
                className="mt-1 w-16 rounded-md border px-2 py-1 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(Math.max(1, room), Math.floor(Number(e.target.value) || 1))))}
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!variant || room < 1}
              aria-label={t('portal_shop.add_label', { name: item.name })}
              onClick={() => variant && onAdd(item, variant, Math.min(quantity, room))}
            >
              {t('portal_shop.add')}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function MyOrder({ order: o, onChanged }: { order: ShopOrder; onChanged: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const oneSize = t('studio_shop.items.one_size');
  const locale = i18n.language === 'he' ? 'he-IL' : 'en-GB';
  const cancel = useMutation({ mutationFn: () => ShopOrdersService.cancelOrder(o.id), onSuccess: onChanged });
  const when = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso)) : '';

  const status =
    o.status === 'awaiting_payment'
      ? t('portal_shop.status.awaiting_payment')
      : o.status === 'paid'
        ? t('portal_shop.status.paid')
        : o.status === 'ready'
          ? t('portal_shop.status.ready')
          : t('portal_shop.status.collected', { date: when(o.collected_at) });

  return (
    <li className="space-y-1 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{t('portal_shop.order_for', { name: o.person_name })}</span>
        <span>{formatMinor(o.total_minor, o.currency, i18n.language)}</span>
      </div>
      <p className="text-muted-foreground">
        {o.lines
          .map((l) => `${l.product_name} · ${sizeLabel(l.variant_label, oneSize)}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`)
          .join(', ')}
      </p>
      <p>{status}</p>
      {o.status === 'awaiting_payment' && (
        <div className="flex flex-wrap items-center gap-3">
          {o.pay_token && (
            <Link to={`/pay/${o.pay_token}`} className="font-medium underline">
              {t('portal_shop.pay_now')}
            </Link>
          )}
          <Button size="sm" variant="ghost" isLoading={cancel.isPending} onClick={() => cancel.mutate()}>
            {t('portal_shop.cancel_order')}
          </Button>
        </div>
      )}
      {cancel.error && (
        <p role="alert" className="text-sm text-error">
          {t('portal_shop.errors.failed')}
        </p>
      )}
    </li>
  );
}
