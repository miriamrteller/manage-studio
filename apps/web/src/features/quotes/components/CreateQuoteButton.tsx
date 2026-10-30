import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Entry point into the quote editor from a lead row or a shoot page
 * (Thread A embeds this on the shoot detail with `engagementId`).
 */
export function CreateQuoteButton({ leadId, engagementId }: { leadId?: string; engagementId?: string }) {
  const { t } = useTranslation();
  const params = new URLSearchParams();
  if (leadId) params.set('lead', leadId);
  if (engagementId) params.set('engagement', engagementId);
  return (
    <Link to={`/admin/quotes/new?${params.toString()}`} className="text-sm font-medium text-primary underline">
      {t('pages.quotes.create')}
    </Link>
  );
}
