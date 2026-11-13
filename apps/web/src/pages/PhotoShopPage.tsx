import { type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { FEATURES } from '@shared/index';
import { useJobs } from '@/features/jobs/hooks/useJobs';
import { useStudioPhotoShopDefaults } from '@/features/jobs/hooks/usePhotoShop';
import { PhotoShopPreview } from '@/features/jobs/components/ClientPhotoShop';
import { PhotoShopDefaultsSetting } from '@/features/settings/components/PhotoShopDefaultsSetting';
import { SmugMugSetting } from '@/features/settings/components/SmugMugSetting';

const TABS = ['overview', 'prices', 'smugmug', 'preview'] as const;
type Tab = (typeof TABS)[number];

/**
 * The studio's photo shop (beta, feature billing:photo_shop). Each shoot's photos are sold
 * privately to that shoot's own client; this page holds the studio-wide parts: what's left
 * to set up, default prices, the SmugMug connection (optional) and a preview of a shoot's shop.
 */
export default function PhotoShopPage() {
  const { t } = useTranslation();
  const { hasFeature, isLoading } = useFeatureGate();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'overview';

  if (isLoading) return null;
  if (!hasFeature(FEATURES.billing.photoShop)) return <Navigate to="/admin/setup" replace />;

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
            <TabsTrigger key={k} value={k}>{t(`photo_shop_admin.tabs.${k}`)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          {tab === 'overview' && <Overview onGo={go} />}
        </TabsContent>
        <TabsContent value="prices" className="pt-4">
          {tab === 'prices' && <PhotoShopDefaultsSetting />}
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
        <Link to="/admin/jobs" className="font-medium underline">{t('photo_shop_admin.overview.shoots_link')}</Link>
      </p>
    </div>
  );
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
