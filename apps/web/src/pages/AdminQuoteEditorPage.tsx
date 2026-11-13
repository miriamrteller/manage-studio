import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { QuoteEditor } from '@/features/quotes/components/QuoteEditor';
import { QuoteSendPanel } from '@/features/quotes/components/QuoteSendPanel';
import { AcceptedQuotePanel } from '@/features/quotes/components/AcceptedQuotePanel';
import { QuoteStatusBadge } from '@/features/quotes/components/QuoteStatusBadge';
import { useAutomaticEmails, useNewQuotePrefill, useQuote } from '@/features/quotes/hooks/useQuotes';
import { QuoteService } from '@/features/quotes/services/quoteService';
import { sendQuoteEmail } from '@/features/quotes/services/sendQuoteEmail';
import { draftFromQuote, newQuoteDraft } from '@/features/quotes/lib/quoteDraft';

type Flash = { ok: boolean; text: string };

/**
 * "Save and email quote": after the save, mark the quote sent and email it in
 * the same click (owner, 13 Nov 2026: fewest interactions). Returns what to show.
 */
function useEmailAfterSave() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { settings } = useAutomaticEmails();
  const [emailing, setEmailing] = useState(false);
  const canEmail = settings?.quote_sent !== false;

  const emailQuote = async (id: string): Promise<Flash> => {
    setEmailing(true);
    try {
      if (!tenant) throw new Error('Tenant not initialized');
      const quote = await QuoteService.get(id);
      if (!quote?.client_email) return { ok: false, text: t('pages.quotes.saved_not_emailed', { reason: t('pages.quotes.send.no_email') }) };
      await QuoteService.markSent(id, 'email');
      await sendQuoteEmail(quote, tenant.id, tenant.language_default ?? 'he');
      return { ok: true, text: t('pages.quotes.saved_and_emailed') };
    } catch (error) {
      return { ok: false, text: t('pages.quotes.saved_not_emailed', { reason: error instanceof Error ? error.message : String(error) }) };
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['quote', id] });
      setEmailing(false);
    }
  };
  return { canEmail, emailing, emailQuote };
}

/** A new quote, started from what the lead or shoot already says (package, date, client). */
function NewQuoteEditor({ leadId, engagementId, currency }: { leadId: string | null; engagementId: string | null; currency: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { prefill, isLoading } = useNewQuotePrefill({ leadId, engagementId });
  const { canEmail, emailing, emailQuote } = useEmailAfterSave();
  if (isLoading) return <p role="status">{t('common.loading')}</p>;
  return (
    <QuoteEditor
      initial={newQuoteDraft({ leadId, engagementId }, new Date(), prefill ?? undefined)}
      currency={currency}
      editable
      canEmail={canEmail}
      emailing={emailing}
      onSaved={async (savedId, { email }) => {
        const flash = email ? await emailQuote(savedId) : undefined;
        navigate(`/admin/projects/quotes/${savedId}`, { replace: true, state: flash ? { flash } : undefined });
      }}
    />
  );
}

/** /admin/projects/quotes/new?lead=…|engagement=… and /admin/projects/quotes/:id */
export default function AdminQuoteEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tenant = useTenant();
  const quoteId = id && id !== 'new' ? id : null;
  const { data: quote, isLoading, error } = useQuote(quoteId);
  const location = useLocation();
  // A new quote arrives here with its result in the address state (same page, so not a fresh mount).
  const stateFlash = (location.state as { flash?: Flash } | null)?.flash ?? null;
  const [ownFlash, setFlash] = useState<Flash | null | undefined>(undefined);
  const flash = ownFlash === undefined ? stateFlash : ownFlash;
  const { canEmail, emailing, emailQuote } = useEmailAfterSave();
  const currency = quote?.currency ?? tenant?.currency ?? 'ILS';

  const back = <Link to="/admin/projects/quotes" className="text-sm underline">{t('pages.quotes.back')}</Link>;

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
        <NewQuoteEditor leadId={leadId} engagementId={engagementId} currency={currency} />
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
      {flash && (
        <p role="status" aria-live="polite" className={flash.ok ? 'text-sm text-success' : 'text-sm text-error'}>
          {flash.text}
        </p>
      )}
      <QuoteSendPanel quote={quote} />
      <AcceptedQuotePanel quote={quote} />
      <QuoteEditor
        key={`${quote.id}-${quote.status}`}
        initial={draftFromQuote(quote)}
        currency={currency}
        editable={editable}
        canEmail={canEmail && Boolean(quote.client_email)}
        emailing={emailing}
        onSaved={async (savedId, { email }) => {
          setFlash(email ? await emailQuote(savedId) : null);
        }}
      />
    </div>
  );
}
