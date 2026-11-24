import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { isLegalPackLive, useTenantLegalProfile } from '@/legal/useLegalDocument';
import { legalBlockedKey, signedDocNoun } from '@/legal/packWording';

/**
 * For a new studio's admin: the legal pages are not published until the draft
 * legal pack is confirmed in Settings → Legal. A reminder only: clients can
 * still book, sign and pay.
 */
export function LegalPackBanner() {
  const { t } = useTranslation();
  const { data: legal } = useTenantLegalProfile();
  if (!legal || isLegalPackLive(legal)) return null;
  return (
    <Alert variant="warning" role="note" className="mb-4 flex flex-wrap items-center gap-3">
      <p className="flex-1 min-w-[12rem] text-sm">
        <strong className="font-semibold">{t(legalBlockedKey(legal.vertical))}</strong>{' '}
        {t('legal.pack.admin_banner', { doc: t(`legal.pack.doc.${signedDocNoun(legal.vertical)}`) })}
      </p>
      <Link to="/admin/settings?tab=legal" className="text-sm font-medium underline">
        {t('legal.pack.admin_banner_link')}
      </Link>
    </Alert>
  );
}
