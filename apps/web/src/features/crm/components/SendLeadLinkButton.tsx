import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { errorKey, sendLink } from './SendFormSection';

/**
 * The lead's next step for class studios and appointment businesses (13 Nov 2026, fewer
 * steps): one button emails the studio's class list or booking page to the lead, the way
 * photographers send a quote. On success the lead moves from New to Contacted.
 */
export function SendLeadLinkButton({
  kind,
  lead,
  onSent,
}: {
  kind: 'class_link' | 'booking_link';
  lead: { id: string; name: string; email: string | null };
  onSent?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!lead.email) {
    return <span className="text-xs text-muted-foreground">{t('pages.crm.leads.link_needs_email')}</span>;
  }
  if (state === 'sent') {
    return (
      <span role="status" className="text-xs text-green-800">
        {t('pages.crm.leads.link_sent', { email: lead.email })}
      </span>
    );
  }

  const send = async () => {
    setState('sending');
    setError(null);
    const lang = i18n.language === 'he' ? 'he' : 'en';
    const firstName = lead.name.trim().split(/\s+/)[0] || null;
    const result = await sendLink(kind, lead.email as string, firstName, lang);
    if (result === 'ok') {
      setState('sent');
      onSent?.();
    } else {
      setState('idle');
      setError(t(errorKey(result)));
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="primary" size="sm" disabled={state === 'sending'} onClick={send}>
        {t(kind === 'class_link' ? 'pages.crm.leads.send_class_link' : 'pages.crm.leads.send_booking_link')}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
