import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { useCaptcha } from '@/components/captcha/useCaptcha';
import { useTenant } from '@/hooks/useTenant';
import { useFillWhenEmpty, useSignedInPrefill } from '@/hooks/useSignedInPrefill';
import { currentStudioDisplayName } from '@/lib/studioDisplayName';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { StudioShopService } from '@/features/shop/services/studioShopService';
import {
  ShopOrdersService,
  shopOrderErrorCode,
  sizeLabel,
  type GuestPayBy,
  type PublicCatalogueItem,
  type PublicCatalogueVariant,
} from '@/features/shop/services/shopOrdersService';

const MAX_QTY = 20;
const ERRORS = ['sold_out', 'item_not_found', 'email_required', 'name_required', 'captcha_failed', 'too_many', 'switched_off'];

interface CartItem {
  item: PublicCatalogueItem;
  variant: PublicCatalogueVariant;
  quantity: number;
}

/**
 * /shop: the studio shop's public page (owner, 22 Nov 2026). Anyone, signed in or not, sees
 * the items, picks sizes and orders: name and email (prefilled when known), then pay by card
 * on the usual pay page, or "Pay the studio directly". Everything is collected at the studio.
 * Stock counts are never shown, only sold-out sizes; the server checks stock again.
 */
export default function PublicShopPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const studioName = currentStudioDisplayName(tenant);
  const queryKey = ['studio-shop', 'public-catalogue', tenant?.id];
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const catalogue = useQuery({
    queryKey,
    queryFn: () => ShopOrdersService.publicCatalogue(tenant!.id),
    enabled: !!tenant?.id,
  });
  const items = catalogue.data ?? [];

  const [cart, setCart] = useState<CartItem[]>([]);
  const [sent, setSent] = useState<GuestPayBy | null>(null);
  const addToCart = (item: PublicCatalogueItem, variant: PublicCatalogueVariant, quantity: number) =>
    setCart((prev) => {
      const at = prev.findIndex((c) => c.variant.id === variant.id);
      if (at < 0) return [...prev, { item, variant, quantity }];
      const next = [...prev];
      next[at] = { ...next[at], quantity: Math.min(MAX_QTY, next[at].quantity + quantity) };
      return next;
    });

  const onPlaced = async (payBy: GuestPayBy, payToken: string | null) => {
    setCart([]);
    await queryClient.invalidateQueries({ queryKey });
    if (payBy === 'card' && payToken) navigate(`/pay/${payToken}`);
    else setSent(payBy);
  };

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('public_shop.title')}</h1>
        <p className="text-muted-foreground" dir="auto">
          {studioName ? t('public_shop.intro', { studio: studioName }) : t('public_shop.intro_no_name')}
        </p>
      </div>

      {sent ? (
        <div className="card space-y-2 p-4" role="status">
          <h2 className="text-lg font-semibold">{t('public_shop.sent_title')}</h2>
          <p>{sent === 'studio' ? t('public_shop.sent_studio') : t('public_shop.sent')}</p>
          <Button variant="outline" size="sm" onClick={() => setSent(null)}>
            {t('public_shop.shop_again')}
          </Button>
        </div>
      ) : catalogue.isError ? (
        <p role="alert" className="alert-error">{t('public_shop.error')}</p>
      ) : catalogue.isLoading || !tenant ? (
        <p role="status">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p>{t('public_shop.empty')}</p>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <PublicItem key={item.id} item={item} onAdd={addToCart} />
            ))}
          </ul>
          {cart.length > 0 && (
            <div className="card space-y-3 p-4" aria-label={t('public_shop.cart')}>
              <h2 className="text-lg font-semibold">{t('public_shop.cart')}</h2>
              <ul className="space-y-1 text-sm">
                {cart.map((c) => (
                  <li key={c.variant.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span dir="auto">
                      {c.item.name}
                      {c.variant.label !== 'One size' ? ` · ${c.variant.label}` : ''}
                      {c.quantity > 1 ? ` ×${c.quantity}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      {formatMinor(c.item.price_minor * c.quantity, c.item.currency, i18n.language)}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('public_shop.remove_label', { name: c.item.name })}
                        onClick={() => setCart((prev) => prev.filter((x) => x.variant.id !== c.variant.id))}
                      >
                        {t('public_shop.remove')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-medium">
                {t('public_shop.total', {
                  total: formatMinor(
                    cart.reduce((sum, c) => sum + c.item.price_minor * c.quantity, 0),
                    cart[0].item.currency,
                    i18n.language,
                  ),
                })}
              </p>
              <Checkout
                subdomain={tenant.subdomain}
                cart={cart}
                onPlaced={onPlaced}
                onStockChanged={() => queryClient.invalidateQueries({ queryKey })}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Checkout({
  subdomain,
  cart,
  onPlaced,
  onStockChanged,
}: {
  subdomain: string;
  cart: CartItem[];
  onPlaced: (payBy: GuestPayBy, payToken: string | null) => Promise<void>;
  onStockChanged: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const captcha = useCaptcha();
  const known = useSignedInPrefill();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [payBy, setPayBy] = useState<GuestPayBy>('card');
  const [honeypot, setHoneypot] = useState('');
  const [shownAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  useFillWhenEmpty(known.name, setName);
  useFillWhenEmpty(known.email, setEmail);
  useFillWhenEmpty(known.phone, setPhone);

  const place = useMutation({
    mutationFn: () =>
      ShopOrdersService.guestCheckout({
        subdomain,
        name,
        email,
        phone,
        lines: cart.map((c) => ({ variantId: c.variant.id, quantity: c.quantity })),
        payBy,
        captchaToken: captcha.token,
        website: honeypot,
        elapsedMs: Date.now() - shownAt,
      }),
    onMutate: () => setError(null),
    onSuccess: ({ payToken }) => onPlaced(payBy, payToken),
    onError: (err) => {
      captcha.reset();
      const code = shopOrderErrorCode(err);
      setError(t(`public_shop.errors.${ERRORS.includes(code) ? code : 'failed'}`));
      if (code === 'sold_out' || code === 'item_not_found') onStockChanged();
    },
  });

  const valid = name.trim().length > 0 && email.trim().includes('@');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || place.isPending) return;
    if (!captcha.ready) {
      setError(t('common.captcha_needed'));
      return;
    }
    place.mutate();
  };

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <h3 className="font-medium">{t('public_shop.your_details')}</h3>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('public_shop.name')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('public_shop.email')}</span>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('public_shop.phone')}</span>
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">{t('public_shop.how_to_pay')}</legend>
        {(['card', 'studio'] as const).map((v) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name={`${id}-pay`} value={v} checked={payBy === v} onChange={() => setPayBy(v)} />
            {v === 'card' ? t('public_shop.pay_card') : t('public_shop.pay_studio')}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {t('public_shop.collect_note')}
        {payBy === 'card' ? ` ${t('public_shop.card_note')}` : ''}
      </p>
      {/* Owner's returns policy (23 Nov 2026), lawyer list row 46. */}
      <p className="text-sm text-muted-foreground">{t('public_shop.returns_note')}</p>
      {/* Honeypot: off-screen for people, filled by bots. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      {error && <p role="alert" className="alert-error">{error}</p>}
      <PrivacyNotice purpose="order" />
      {captcha.widget}
      <Button type="submit" variant="primary" isLoading={place.isPending} disabled={!valid}>
        {payBy === 'card' ? t('public_shop.place_order_card') : t('public_shop.place_order')}
      </Button>
    </form>
  );
}

function PublicItem({
  item,
  onAdd,
}: {
  item: PublicCatalogueItem;
  onAdd: (item: PublicCatalogueItem, variant: PublicCatalogueVariant, quantity: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const oneSize = t('studio_shop.items.one_size');
  const firstInStock = item.variants.find((v) => v.in_stock);
  const [variantId, setVariantId] = useState(firstInStock?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const variant = item.variants.find((v) => v.id === variantId && v.in_stock) ?? firstInStock;
  const sized = item.variants.length > 1 || (item.variants[0] && item.variants[0].label !== 'One size');

  return (
    <li className="card flex gap-3 p-3 text-sm">
      {item.image_path ? (
        <img
          src={StudioShopService.imageUrl(item.image_path)}
          alt={item.name}
          className="h-28 w-28 shrink-0 rounded object-cover"
        />
      ) : (
        <div aria-hidden="true" className="h-28 w-28 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <p className="font-medium" dir="auto">{item.name}</p>
          <p>{formatMinor(item.price_minor, item.currency, i18n.language)}</p>
          {item.description && <p className="text-muted-foreground" dir="auto">{item.description}</p>}
        </div>
        {!firstInStock ? (
          <p className="font-medium text-muted-foreground">{t('public_shop.sold_out')}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            {sized && (
              <label className="text-xs" htmlFor={`${id}-size`}>
                <span className="block">{t('public_shop.size')}</span>
                <select
                  id={`${id}-size`}
                  className="mt-1 rounded-md border px-2 py-1 text-sm"
                  value={variant?.id ?? ''}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  {item.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={!v.in_stock}>
                      {v.in_stock ? sizeLabel(v.label, oneSize) : t('public_shop.size_sold_out', { size: sizeLabel(v.label, oneSize) })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs">
              <span className="block">{t('public_shop.quantity')}</span>
              <input
                type="number"
                min={1}
                max={MAX_QTY}
                className="mt-1 w-16 rounded-md border px-2 py-1 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_QTY, Math.floor(Number(e.target.value) || 1))))}
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!variant}
              aria-label={t('public_shop.add_label', { name: item.name })}
              onClick={() => variant && onAdd(item, variant, quantity)}
            >
              {t('public_shop.add')}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
