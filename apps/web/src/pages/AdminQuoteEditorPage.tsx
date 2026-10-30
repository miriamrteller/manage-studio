import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import { QuoteEditor } from '@/features/quotes/components/QuoteEditor';
import { QuoteSendPanel } from '@/features/quotes/components/QuoteSendPanel';
import { AcceptedQuotePanel } from '@/features/quotes/components/AcceptedQuotePanel';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';
import { useQuote } from '@/features/quotes/hooks/useQuotes';
import { draftFromQuote, newQuoteDraft } from '@/features/quotes/lib/quoteDraft';

/** /admin/quotes/new?lead=…|engagement=… and /admin/quotes/:id */
export default function AdminQuoteEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tenant = useTenant();
  const quoteId = id && id !== 'new' ? id : null;
  const { data: quote, isLoading, error } = useQuote(quoteId);
  const currency = quote?.currency ?? tenant?.currency ?? 'ILS';

  const back = <Link to="/admin/quotes" className="text-sm underline">{t('pages.quotes.back')}</Link>;

  if (!quoteId) {
    const leadId = searchParams.get('lead');
    const engagementId = searchParams.get('engagement');
    if (!leadId && !engagementId) {
      return <div className="space-y-4">{back}<p>{t('pages.quotes.errors.no_source')}</p></div>;
    }
    return (
      <div className="space-y-6">
        {back}
        <h1 className="text-3xl font-bold">{t('pages.quotes.new_title')}</h1>
        <QuoteEditor
          initial={newQuoteDraft({ leadId, engagementId })}
          currency={currency}
          editable
          onSaved={(savedId) => navigate(`/admin/quotes/${savedId}`, { replace: true })}
        />
      </div>
    );
  }

  if (isLoading) return <p role="status">{t('common.loading')}</p>;
  if (error instanceof Error) return <div className="alert-error" role="alert">{error.message}</div>;
  if (!quote) return <div className="space-y-4">{back}<p>{t('pages.quotes.errors.not_found')}</p></div>;

  const editable = quote.status === 'draft' || quote.status === 'sent';
  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{quote.client_name ?? t('pages.quotes.editor_title')}</h1>
        <QuoteStatusBadge status={quote.status} />
      </div>
      <QuoteSendPanel quote={quote} />
      <AcceptedQuotePanel quote={quote} />
      <QuoteEditor
        key={`${quote.id}-${quote.status}`}
        initial={draftFromQuote(quote)}
        currency={currency}
        editable={editable}
        onSaved={() => undefined}
      />
    </div>
  );
}
