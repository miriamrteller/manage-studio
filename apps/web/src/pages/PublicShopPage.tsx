import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { currentStudioDisplayName } from '@/lib/studioDisplayName';
import { formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import { StudioShopService } from '@/features/shop/services/studioShopService';
import {
  ShopOrdersService,
  sizeLabel,
  type PublicCatalogueItem,
} from '@/features/shop/services/shopOrdersService';

/**
 * /shop: the studio shop's public page (owner, 22 Nov 2026). Anyone visiting the studio's
 * site sees the items, pictures, prices and sizes, and which sizes are sold out. Buying is
 * still in the signed-in family page (PortalShop) for now, so the page points there.
 */
export default function PublicShopPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const studioName = currentStudioDisplayName(tenant);
  const catalogue = useQuery({
    queryKey: ['studio-shop', 'public-catalogue', tenant?.id],
    queryFn: () => ShopOrdersService.publicCatalogue(tenant!.id),
    enabled: !!tenant?.id,
  });
  const items = catalogue.data ?? [];

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('public_shop.title')}</h1>
        <p className="text-muted-foreground" dir="auto">
          {studioName ? t('public_shop.intro', { studio: studioName }) : t('public_shop.intro_no_name')}
        </p>
      </div>

      {catalogue.isError ? (
        <p role="alert" className="alert-error">{t('public_shop.error')}</p>
      ) : catalogue.isLoading || !tenant ? (
        <p role="status">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p>{t('public_shop.empty')}</p>
      ) : (
        <>
          <div className="card space-y-2 p-4 text-sm">
            <p>{user ? t('public_shop.how_to_buy_signed_in') : t('public_shop.how_to_buy')}</p>
            <Link to={user ? '/dashboard' : '/login'} className="font-medium underline">
              {user ? t('public_shop.open_my_page') : t('public_shop.sign_in')}
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <PublicItem key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PublicItem({ item }: { item: PublicCatalogueItem }) {
  const { t, i18n } = useTranslation();
  const oneSize = t('studio_shop.items.one_size');
  const soldOut = item.variants.length > 0 && item.variants.every((v) => !v.in_stock);
  const sized = item.variants.filter((v) => v.label !== 'One size');

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
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium" dir="auto">{item.name}</p>
        <p>{formatMinor(item.price_minor, item.currency, i18n.language)}</p>
        {item.description && <p className="text-muted-foreground" dir="auto">{item.description}</p>}
        {soldOut ? (
          <p className="font-medium text-muted-foreground">{t('public_shop.sold_out')}</p>
        ) : (
          sized.length > 0 && (
            <p>
              <span className="text-muted-foreground">{t('public_shop.sizes')}: </span>
              {sized
                .map((v) =>
                  v.in_stock ? sizeLabel(v.label, oneSize) : t('public_shop.size_sold_out', { size: v.label }),
                )
                .join(', ')}
            </p>
          )
        )}
      </div>
    </li>
  );
}
