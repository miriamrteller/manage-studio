import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PhotoShopLinkService } from '@/features/jobs/services/photoShopLinkService';
import { CLIENT_PORTAL_PATH } from '@/features/jobs/components/BackToPortalButton';

/**
 * /shop/:token — the link the studio sends with "Send shop link". Signs the client in
 * (valid 3 days) and opens their page, where the photo shop is. The token never stays
 * in the address.
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
    window.history.replaceState(null, '', '/shop');
    if (!token) {
      setFailed(true);
      return;
    }
    PhotoShopLinkService.open(token)
      .then(() => navigate(CLIENT_PORTAL_PATH, { replace: true }))
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
