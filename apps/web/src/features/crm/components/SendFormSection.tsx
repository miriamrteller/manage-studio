import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

type Kind = 'form' | 'web_instructions';

/** wa.me wants an international number in digits only; a local Israeli 0… number gets 972. */
export function whatsappNumber(raw: string, country?: string | null): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits.slice(1).replace(/\D/g, '') || null;
  if (digits.startsWith('00')) return digits.slice(2) || null;
  if (digits.startsWith('0') && (country ?? 'IL') === 'IL') return `972${digits.slice(1)}`;
  return digits;
}

async function sendLink(
  kind: Kind,
  email: string,
  name: string | null,
  lang: 'en' | 'he',
  formSlug?: string | null,
): Promise<'ok' | string> {
  const { data, error } = await supabase.functions.invoke('send-lead-form-link', {
    body: formSlug ? { kind, email, name, lang, formSlug } : { kind, email, name, lang },
  });
  if (!error && data && (data as { ok?: boolean }).ok) return 'ok';
  let code = (data as { error?: string } | null)?.error;
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!code && context?.json) {
    try {
      code = ((await context.json()) as { error?: string }).error;
    } catch {
      // keep generic
    }
  }
  return code ?? 'failed';
}

function errorKey(code: string): string {
  switch (code) {
    case 'invalid_email':
    case 'tenant_limit':
    case 'recipient_cooldown':
    case 'form_closed':
      return `pages.crm.get_leads.send_error_${code}`;
    default:
      return 'pages.crm.get_leads.send_error_failed';
  }
}

/**
 * "Send the form to someone": the studio types a name and email (and a phone
 * for WhatsApp); the server emails the form link from the studio, tagged
 * src=direct. Nothing is stored about the person until they fill in the form.
 */
export function SendFormSection({
  headingLevel,
  formLinkForWhatsApp,
  shareMessage,
  country,
  formSlug = null,
}: {
  /** A named form to send instead of the general form. */
  formSlug?: string | null;
  headingLevel: 3 | 4;
  formLinkForWhatsApp: string;
  shareMessage: string;
  country?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const lang: 'en' | 'he' = i18n.language?.startsWith('he') ? 'he' : 'en';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const H = `h${headingLevel}` as 'h3' | 'h4';
  const wa = whatsappNumber(phone, country);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setResult(null);
    const outcome = await sendLink('form', email.trim(), name.trim() || null, lang, formSlug);
    setSending(false);
    if (outcome === 'ok') {
      setResult({ ok: true, text: t('pages.crm.get_leads.send_done', { email: email.trim() }) });
      setName('');
      setEmail('');
    } else {
      setResult({ ok: false, text: t(errorKey(outcome)) });
    }
  };

  const openWhatsApp = () => {
    if (!wa) return;
    const greeting = name.trim() ? `${t('pages.crm.get_leads.hello', { name: name.trim() })} ` : '';
    const text = `${greeting}${shareMessage} ${formLinkForWhatsApp}`;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <form onSubmit={submit} className="card p-4 space-y-3" aria-labelledby={`${id}-title`}>
      <H id={`${id}-title`} className="font-semibold">
        {t('pages.crm.get_leads.send_title')}
      </H>
      <p className="text-sm text-muted-foreground">{t('pages.crm.get_leads.send_hint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-name`} className="block text-sm font-medium mb-1">
            {t('pages.crm.get_leads.send_name')}
          </label>
          <input id={`${id}-name`} maxLength={80} autoComplete="off" className="w-full border rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className="block text-sm font-medium mb-1">
            {t('pages.crm.get_leads.send_email')}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            dir="ltr"
            autoComplete="off"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className="block text-sm font-medium mb-1">
            {t('pages.crm.get_leads.send_phone')}
          </label>
          <input
            id={`${id}-phone`}
            type="tel"
            dir="ltr"
            autoComplete="off"
            className="w-full border rounded px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!email.trim() || sending}>
          {sending ? t('common.loading') : t('pages.crm.get_leads.send_by_email')}
        </Button>
        <Button type="button" variant="outline" disabled={!wa} onClick={openWhatsApp}>
          {t('pages.crm.get_leads.send_by_whatsapp')}
        </Button>
      </div>
      <p aria-live="polite" role={result && !result.ok ? 'alert' : undefined} className={result?.ok ? 'text-sm' : 'text-sm text-destructive'}>
        {result?.text}
      </p>
    </form>
  );
}

/** "Email these instructions to my web person": the server sends the code + steps for each builder. */
export function EmailInstructionsForm() {
  const { t, i18n } = useTranslation();
  const id = useId();
  const lang: 'en' | 'he' = i18n.language?.startsWith('he') ? 'he' : 'en';
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setResult(null);
    const outcome = await sendLink('web_instructions', email.trim(), null, lang);
    setSending(false);
    setResult(
      outcome === 'ok'
        ? { ok: true, text: t('pages.crm.get_leads.send_done', { email: email.trim() }) }
        : { ok: false, text: t(errorKey(outcome)) },
    );
    if (outcome === 'ok') setEmail('');
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={`${id}-email`} className="block text-sm font-medium">
        {t('pages.crm.get_leads.instructions_title')}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${id}-email`}
          type="email"
          dir="ltr"
          autoComplete="off"
          placeholder={t('pages.crm.get_leads.instructions_placeholder')}
          className="flex-1 min-w-48 border rounded px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!email.trim() || sending}>
          {sending ? t('common.loading') : t('pages.crm.get_leads.instructions_send')}
        </Button>
      </div>
      <p aria-live="polite" role={result && !result.ok ? 'alert' : undefined} className={result?.ok ? 'text-sm' : 'text-sm text-destructive'}>
        {result?.text}
      </p>
    </form>
  );
}
