import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PhotoShopLinkService, shopGalleryPath } from '@/features/jobs/services/photoShopLinkService';
import { CLIENT_PORTAL_PATH } from '@/features/jobs/components/BackToPortalButton';

/**
 * /shop/:token — the link the studio sends with "Send shop link". Signs the client in
 * (valid 3 days) and opens that shoot's gallery in the photo shop on their page
 * (owner, 22 Nov 2026: straight to the gallery, never another tab). The token never
 * stays in the address.
 */
export default function ShopLinkPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Drop the token from the address at once. Not "/shop": that is the studio's public
    // shop now, where a refresh would leave the client.
    window.history.replaceState(window.history.state, '', shopGalleryPath(null));
    if (!token) {
      setFailed(true);
      return;
    }
    PhotoShopLinkService.open(token)
      .then(({ engagementId }) => navigate(shopGalleryPath(engagementId), { replace: true }))
      .catch(() => setFailed(true));
  }, [token, navigate]);

  return (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">{t('pages.client_portal.photo_shop.title')}</h1>
      {failed ? (
        <>
          <p className="text-sm text-error" role="alert">{t('pages.client_portal.photo_shop.link_expired')}</p>
          <Link className="text-sm font-medium underline" to="/login" state={{ from: CLIENT_PORTAL_PATH }}>
            {t('pages.client_portal.photo_shop.link_sign_in')}
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground" role="status">{t('pages.client_portal.photo_shop.link_opening')}</p>
      )}
    </div>
  );
}
