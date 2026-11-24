import { type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHasFeature } from '@/hooks/useHasFeature';
import { FEATURES } from '@shared/index';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { useStudioPhotoOrders, useStudioPhotoShopDefaults } from '@/features/jobs/hooks/usePhotoShop';
import { Badge } from '@/components/ui/badge';
import { formatDueDate, formatMinor } from '@/features/jobs/lib/jobPaymentFormat';
import type { PhotoOrderStatus } from '@/features/jobs/services/photoShopService';
import { PhotoShopPreview } from '@/features/jobs/components/ClientPhotoShop';
import { PhotoShopDefaultsSetting } from '@/features/settings/components/PhotoShopDefaultsSetting';
import { PhotoProductsSetting } from '@/features/settings/components/PhotoProductsSetting';
import { SmugMugSetting } from '@/features/settings/components/SmugMugSetting';

const TABS = ['overview', 'orders', 'prices', 'smugmug', 'preview'] as const;
type Tab = (typeof TABS)[number];

/**
 * The studio's photo shop (beta, feature billing:photo_shop). Each shoot's photos are sold
 * privately to that shoot's own client; this page holds the studio-wide parts: what's left
 * to set up, every shoot's orders in one list, default prices, the SmugMug connection (optional) and a preview of a shoot's shop.
 */
export default function PhotoShopPage() {
  const { t } = useTranslation();
  const { hasFeature, isLoading } = useHasFeature();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'overview';

  if (isLoading) return null;
  if (!hasFeature(FEATURES.billing.photoShop)) return <Navigate to="/admin" replace />;

  const go = (next: string) => setParams(next === 'overview' ? {} : { tab: next }, { replace: true });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">{t('photo_shop_admin.title')}</h1>
        <p className="text-sm text-gray-600">{t('photo_shop_admin.intro')}</p>
      </div>
      <Tabs value={tab} onValueChange={go}>
        <TabsList>
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k} data-tour={`photo-shop-tab-${k}`}>{t(`photo_shop_admin.tabs.${k}`)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          {tab === 'overview' && <Overview onGo={go} />}
        </TabsContent>
        <TabsContent value="orders" className="pt-4">
          {tab === 'orders' && <OrdersTab />}
        </TabsContent>
        <TabsContent value="prices" className="pt-4">
          {tab === 'prices' && (
            <div className="space-y-8">
              <PhotoShopDefaultsSetting />
              <PhotoProductsSetting />
            </div>
          )}
        </TabsContent>
        <TabsContent value="smugmug" className="pt-4">
          {tab === 'smugmug' && <SmugMugSetting />}
        </TabsContent>
        <TabsContent value="preview" className="pt-4">
          {tab === 'preview' && (
            <PreviewTab
              shootId={params.get('shoot') ?? ''}
              onShoot={(id) => setParams(id ? { tab: 'preview', shoot: id } : { tab: 'preview' }, { replace: true })}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Step({ done, label, action }: { done: boolean; label: string; action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
      <span>
        <span className="sr-only">{done ? t('photo_shop_admin.overview.done') : t('photo_shop_admin.overview.to_do')}: </span>
        <span aria-hidden="true">{done ? '✓ ' : '○ '}</span>
        {label}
      </span>
      {action}
    </li>
  );
}

function Overview({ onGo }: { onGo: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const { defaults } = useStudioPhotoShopDefaults();
  const pricesSet = defaults.data?.price_per_photo_minor != null;
  const goButton = (target: Tab, label: string) => (
    <button type="button" className="font-medium underline" onClick={() => onGo(target)}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        <Step done={pricesSet} label={t('photo_shop_admin.overview.prices')} action={goButton('prices', t('photo_shop_admin.tabs.prices'))} />
      </ul>
      <p className="text-sm text-gray-600">
        {t('photo_shop_admin.overview.private')}{' '}
        <Link to="/admin/projects" className="font-medium underline">{t('photo_shop_admin.overview.shoots_link')}</Link>
      </p>
    </div>
  );
}

const ORDER_BADGE: Record<PhotoOrderStatus, 'default' | 'secondary' | 'success' | 'destructive'> = {
  awaiting_payment: 'secondary',
  paid: 'default',
  delivered: 'success',
  cancelled: 'destructive',
  refunded: 'destructive',
};

/**
 * Every shoot's photo orders in one list, newest first. Sending the photos and recording
 * cash stay on the shoot's own Photo shop tab, which each row opens.
 */
function OrdersTab() {
  const { t, i18n } = useTranslation();
  const orders = useStudioPhotoOrders();
  const { jobs } = useJobs();
  const shoots = new Map(jobs.map((j) => [j.engagement_id, j]));

  if (orders.isLoading) return null;
  if (orders.isError) return <p role="alert" className="text-sm text-red-700">{t('photo_shop_admin.orders.failed')}</p>;
  const list = orders.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('photo_shop_admin.orders.intro')}</p>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('photo_shop_admin.orders.none')}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((o) => {
            const shoot = shoots.get(o.engagement_id);
            const name = [shoot?.client_name, shoot?.package_name].filter(Boolean).join(' · ') || t('photo_shop_admin.orders.shoot_unknown');
            return (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">{name}</p>
                  <p className="text-muted-foreground">
                    {formatDueDate(o.created_at, i18n.language)} ·{' '}
                    {orderCountsText(o, t)} ·{' '}
                    {formatMinor(o.total_minor, o.currency, i18n.language)}
                    {o.status === 'awaiting_payment' && o.pay_by_cash && (
                      <>
                        {' · '}
                        {o.pay_method === 'bit'
                          ? t('photo_shop_admin.orders.bit')
                          : o.pay_method === 'bank'
                            ? t('photo_shop_admin.orders.bank')
                            : t('photo_shop_admin.orders.cash')}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {o.status === 'awaiting_payment' && o.proof_sent_at && (
                    <Badge variant="success">{t('pages.jobs.photo_shop.proof_sent')}</Badge>
                  )}
                  <Badge variant={ORDER_BADGE[o.status]}>{t(`pages.jobs.photo_shop.status.${o.status}`)}</Badge>
                  <Link to={`/admin/projects/${o.engagement_id}?tab=shop`} className="font-medium underline">
                    {t('photo_shop_admin.orders.open')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "2 photos · 1 print" for an order: digital photos and products (prints ...). */
function orderCountsText(o: { photo_count: number; product_count?: number }, t: TFunction) {
  return [
    o.photo_count > 0 ? t('pages.jobs.photo_shop.order_photos', { count: o.photo_count }) : null,
    (o.product_count ?? 0) > 0 ? t('pages.jobs.photo_shop.order_prints', { count: o.product_count }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The shoot comes from the address (?shoot=), so "See it as your client" on a shoot opens it ready. */
function PreviewTab({ shootId, onShoot }: { shootId: string; onShoot: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const { jobs } = useJobs();
  const shoots = jobs.filter((j) => j.job_status !== 'cancelled');
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language === 'he' ? 'he-IL' : 'en-GB') : '';

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('photo_shop_admin.preview.intro')}</p>
      <div className="space-y-1">
        <label htmlFor="photo-shop-preview-shoot" className="block text-sm font-medium">
          {t('photo_shop_admin.preview.shoot')}
        </label>
        <select
          id="photo-shop-preview-shoot"
          className="w-full rounded-md border border-gray-300 p-2 text-sm sm:w-96"
          value={shootId}
          onChange={(e) => onShoot(e.target.value)}
        >
          <option value="">{t('photo_shop_admin.preview.choose')}</option>
          {shoots.map((j) => (
            <option key={j.engagement_id} value={j.engagement_id}>
              {[j.client_name, j.package_name, date(j.booked_starts_at)].filter(Boolean).join(' · ')}
            </option>
          ))}
        </select>
      </div>
      {shootId && <PhotoShopPreview engagementId={shootId} />}
    </div>
  );
}
