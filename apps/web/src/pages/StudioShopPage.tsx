import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { FEATURES } from '@shared/index';
import { ShopProducts } from '@/features/shop/components/ShopProducts';
import { ShopOrders } from '@/features/shop/components/ShopOrders';

/**
 * The studio shop (beta, feature billing:studio_shop): uniforms and items the studio sells
 * to its families. Families order in their portal, pay through their child's class and
 * collect at the studio: Orders first (what to get ready), then the Items for sale.
 */
export default function StudioShopPage() {
  const { t } = useTranslation();
  const { hasFeature, isLoading } = useFeatureGate();
  if (isLoading) return null;
  if (!hasFeature(FEATURES.billing.studioShop)) return <Navigate to="/admin" replace />;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-bold">{t('studio_shop.title')}</h1>
          <Badge variant="secondary">{t('studio_shop.beta')}</Badge>
        </div>
        <p className="text-sm text-gray-600">{t('studio_shop.intro')}</p>
      </div>
      <section aria-labelledby="studio-shop-orders" className="space-y-3">
        <h2 id="studio-shop-orders" className="text-xl font-semibold">{t('studio_shop.orders.title')}</h2>
        <ShopOrders />
      </section>
      <section aria-labelledby="studio-shop-items" className="space-y-3">
        <h2 id="studio-shop-items" className="text-xl font-semibold">{t('studio_shop.items.title')}</h2>
        <ShopProducts />
      </section>
    </div>
  );
}
