import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared';
import { useQuoteList } from '../hooks/useQuotes';
import { formatQuoteDate, formatQuoteMoney } from '../lib/quoteFormat';
import { AutomaticEmailSettings } from './AutomaticEmailSettings';
import { QuoteStatusBadge } from './QuoteStatusBadge';

export function QuotesList() {
  const { t, i18n } = useTranslation();
  const { data: quotes = [], isLoading, error } = useQuoteList();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t('pages.quotes.title')}</h1>
        <Link to="/admin/leads" className="text-sm underline">{t('pages.quotes.from_leads')}</Link>
      </div>
      <p className="text-sm text-muted-foreground">{t('pages.quotes.description')}</p>

      {isLoading && <p role="status">{t('common.loading')}</p>}
      {error instanceof Error && <div className="alert-error" role="alert">{error.message}</div>}
      {!isLoading && quotes.length === 0 && (
        <EmptyState title={t('pages.quotes.empty_title')} message={t('pages.quotes.empty_message')} />
      )}

      {quotes.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-start">{t('pages.quotes.columns.client')}</th>
                <th className="px-3 py-2 text-start">{t('pages.quotes.columns.status')}</th>
                <th className="px-3 py-2 text-start">{t('pages.quotes.columns.total')}</th>
                <th className="px-3 py-2 text-start">{t('pages.quotes.columns.shoot_date')}</th>
                <th className="px-3 py-2 text-start">{t('pages.quotes.columns.valid_until')}</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/admin/quotes/${quote.id}`} className="underline">
                      {quote.client_name ?? '—'}
                      {quote.title && <span className="ms-2 text-muted-foreground">· {quote.title}</span>}
                    </Link>
                  </td>
                  <td className="px-3 py-2"><QuoteStatusBadge status={quote.status} /></td>
                  <td className="px-3 py-2">
                    <bdi>{formatQuoteMoney(quote.total_minor, quote.currency, i18n.language)}</bdi>
                  </td>
                  <td className="px-3 py-2">{formatQuoteDate(quote.shoot_date, i18n.language)}</td>
                  <td className="px-3 py-2">{formatQuoteDate(quote.valid_until, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AutomaticEmailSettings />
    </div>
  );
}
