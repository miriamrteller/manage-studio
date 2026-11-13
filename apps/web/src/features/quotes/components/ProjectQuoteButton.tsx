import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QuoteService } from '../services/quoteService';
import { CreateQuoteButton } from './CreateQuoteButton';

/**
 * The quote button on a project page: "Open quote" once the project has a live
 * quote (draft, sent or accepted), so a second one is never started by mistake;
 * "Create quote" otherwise.
 */
export function ProjectQuoteButton({ engagementId }: { engagementId: string }) {
  const { t } = useTranslation();
  const { data: quote, isLoading } = useQuery({
    queryKey: ['engagement-open-quote', engagementId],
    queryFn: () => QuoteService.openForEngagement(engagementId),
  });
  if (isLoading) return null;
  if (!quote) return <CreateQuoteButton engagementId={engagementId} />;
  return (
    <Link to={`/admin/projects/quotes/${quote.id}`} className="text-sm font-medium text-primary underline">
      {t('pages.quotes.open')}
    </Link>
  );
}
