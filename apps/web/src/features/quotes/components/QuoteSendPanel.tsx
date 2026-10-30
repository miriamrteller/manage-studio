import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useAutomaticEmails, useQuoteMutations } from '../hooks/useQuotes';
import { quotePublicUrl, quoteWhatsAppUrl } from '../lib/quoteLinks';
import type { QuoteDetail } from '../services/quoteService';
import { sendQuoteEmail } from '../services/sendQuoteEmail';

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export function QuoteSendPanel({ quote }: { quote: QuoteDetail }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { settings } = useAutomaticEmails();
  const { markSent } = useQuoteMutations();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (quote.status !== 'draft' && quote.status !== 'sent') return null;
  const url = quotePublicUrl(quote.public_token);
  const emailEnabled = settings?.quote_sent !== false;
  const canEmail = Boolean(quote.client_email) && emailEnabled;

  const run = async (action: () => Promise<void>, okText: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ kind: 'ok', text: okText });
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = () =>
    run(async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      await markSent.mutateAsync({ id: quote.id, via: 'email' });
      await sendQuoteEmail(quote, tenant.id, tenant.language_default ?? 'he');
    }, t('pages.quotes.send.email_sent'));

  const sendWhatsApp = () => {
    // Open synchronously (popup blockers), then record the send.
    const message = t('pages.quotes.send.whatsapp_message', { name: quote.client_name ?? '', url });
    window.open(quoteWhatsAppUrl(quote.client_phone, message), '_blank', 'noopener,noreferrer');
    void run(() => markSent.mutateAsync({ id: quote.id, via: 'whatsapp' }), t('pages.quotes.send.marked_sent'));
  };

  const copyLink = () =>
    run(async () => {
      await navigator.clipboard.writeText(url);
      await markSent.mutateAsync({ id: quote.id, via: 'link' });
    }, t('pages.quotes.send.link_copied'));

  return (
    <section aria-labelledby="quote-send-heading" className="card p-4 space-y-3">
      <h2 id="quote-send-heading" className="font-semibold">{t('pages.quotes.send.title')}</h2>
      <code className="block text-xs bg-muted border rounded px-2 py-1 break-all" dir="ltr">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !canEmail} onClick={() => void sendEmail()}>
          {t('pages.quotes.send.email')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={sendWhatsApp}>
          {t('pages.quotes.send.whatsapp')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void copyLink()}>
          {t('pages.quotes.send.copy_link')}
        </Button>
      </div>
      {!quote.client_email && <p className="text-sm text-muted-foreground">{t('pages.quotes.send.no_email')}</p>}
      {quote.client_email && !emailEnabled && (
        <p className="text-sm text-muted-foreground">{t('pages.quotes.send.email_disabled')}</p>
      )}
      <p role="status" aria-live="polite" className={feedback?.kind === 'error' ? 'text-sm text-error' : 'text-sm'}>
        {feedback?.text ?? ''}
      </p>
    </section>
  );
}
