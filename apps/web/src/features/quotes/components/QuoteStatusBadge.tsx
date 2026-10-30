import { useTranslation } from 'react-i18next';
import type { QuoteStatus } from '../lib/quoteSchemas';

const TONE: Record<QuoteStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  accepted: 'bg-success/10 text-success',
  declined: 'bg-error/10 text-error',
  expired: 'bg-muted text-muted-foreground',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {t(`pages.quotes.status.${status}`)}
    </span>
  );
}
