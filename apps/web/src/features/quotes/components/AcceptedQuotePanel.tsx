import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import type { QuoteDetail } from '../services/quoteService';

/**
 * After acceptance: link to the shoot, and — when the quote asked for it — send
 * the contract through Thread A's send-job-contract-link (admin session; the
 * anonymous accept-quote call cannot use it).
 */
export function AcceptedQuotePanel({ quote }: { quote: QuoteDetail }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (quote.status !== 'accepted' || !quote.engagement_id) return null;
  const engagementId = quote.engagement_id;

  const sendContract = async () => {
    if (!quote.client_email) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('send-job-contract-link', {
      body: { engagementId, recipientEmail: quote.client_email },
    });
    const failure = error?.message ?? (data as { error?: string } | null)?.error ?? null;
    setMessage(failure ? { ok: false, text: failure } : { ok: true, text: t('pages.quotes.accepted.contract_sent') });
    setBusy(false);
  };

  return (
    <section aria-labelledby="quote-accepted-heading" className="card p-4 space-y-3">
      <h2 id="quote-accepted-heading" className="font-semibold">{t('pages.quotes.accepted.title')}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/admin/jobs/${engagementId}`} className="text-sm font-medium text-primary underline">
          {t('pages.quotes.accepted.open_shoot')}
        </Link>
        {quote.send_contract_on_accept && (
          <Button variant="primary" disabled={busy || !quote.client_email} onClick={() => void sendContract()}>
            {t('pages.quotes.accepted.send_contract')}
          </Button>
        )}
      </div>
      {quote.send_contract_on_accept && !quote.client_email && (
        <p className="text-sm text-muted-foreground">{t('pages.quotes.send.no_email')}</p>
      )}
      <p role="status" aria-live="polite" className={message?.ok === false ? 'text-sm text-error' : 'text-sm'}>
        {message?.text ?? ''}
      </p>
    </section>
  );
}
