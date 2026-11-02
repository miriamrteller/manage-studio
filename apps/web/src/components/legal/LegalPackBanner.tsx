import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { isLegalPackLive, useTenantLegalProfile } from '@/legal/useLegalDocument';

/**
 * A gentle reminder for a new studio's admin: its legal pages and forms stay
 * offline until the draft legal pack is confirmed in Settings → Legal.
 */
export function LegalPackBanner() {
  const { t } = useTranslation();
  const { data: legal } = useTenantLegalProfile();
  if (!legal || isLegalPackLive(legal)) return null;
  return (
    <Alert variant="warning" role="note" className="mb-4 flex flex-wrap items-center gap-3">
      <p className="flex-1 min-w-[12rem] text-sm">{t('legal.pack.admin_banner')}</p>
      <Link to="/admin/setup/settings?tab=legal" className="text-sm font-medium underline">
        {t('legal.pack.admin_banner_link')}
      </Link>
    </Alert>
  );
}
