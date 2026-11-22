import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientPhotoShop } from '@/features/jobs/components/ClientPhotoShop';
import { useClientPhotoShopOpen } from '@/features/jobs/hooks/useClientPhotoShopOpen';
import { CLIENT_PORTAL_PATH } from '@/features/jobs/components/BackToPortalButton';

/**
 * /photos/:engagementId — one shoot's gallery in the photo shop, on its own page: where
 * the gallery email's one button lands after it signs the client in (owner, 22 Nov 2026:
 * straight to the photo shop, nothing else in the way). The client's other pages are one
 * small link away.
 */
export default function ClientShootPhotosPage() {
  const { t } = useTranslation();
  const { engagementId = '' } = useParams();
  const shop = useClientPhotoShopOpen(engagementId ? [engagementId] : []);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      {shop.loading ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : shop.open ? (
        <ClientPhotoShop engagementId={engagementId} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">{t('pages.client_portal.photo_shop.not_open')}</p>
      )}
      <p className="text-sm">
        <Link className="underline underline-offset-2" to={CLIENT_PORTAL_PATH}>
          {t('pages.client_portal.photo_shop.my_page')}
        </Link>
      </p>
    </main>
  );
}
