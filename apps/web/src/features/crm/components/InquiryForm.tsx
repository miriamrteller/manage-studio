import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ConsentCheckboxes } from '@/components/legal/ConsentCheckboxes';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { Button } from '@/components/ui/button';
import { useCaptcha } from '@/components/captcha/useCaptcha';
import { useTenant } from '@/hooks/useTenant';
import { CONSENT_WORDING_VERSION, MARKETING_KINDS, consentWording, type ConsentState } from '@/legal/consents';
import { useLegalLang } from '@/legal/useLegalDocument';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import { readInquiryTags } from '../lib/inquiryTags';
import { validateLeadAnswers } from '@shared/index';
import { useLeadFormQuestions } from '../hooks/useLeadFormQuestions';
import { LeadQuestionFields } from './LeadQuestionFields';

/**
 * Public enquiry form — the "website" capture channel, and via ?src= tags the
 * landing spot for every social capture link (Instagram bio, WhatsApp status,
 * LinkedIn) — docs/plans/crm-lead-capture-channels.md. Rendered on /inquire
 * and, without the app chrome, on /embed/inquire (iframe on the studio's own
 * site). Posts to the public crm-lead-capture edge function; no login.
 *
 * Spam: hidden `website` honeypot, Turnstile when VITE_TURNSTILE_SITE_KEY is
 * set (checked server-side), and the server's rate limit. Marketing opt-ins
 * are never pre-ticked and are sent separately from the source/campaign tags.
 */
export function InquiryForm({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { src, campaign } = readInquiryTags(searchParams);
  const captcha = useCaptcha();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [marketing, setMarketing] = useState<ConsentState>({});
  const lang = useLegalLang();
  const tenant = useTenant();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'captcha' | 'answers'>('idle');
  const { questions } = useLeadFormQuestions();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [invalid, setInvalid] = useState<string[]>([]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || status === 'sending') return;
    const checked = validateLeadAnswers(questions, answers);
    setInvalid(checked.invalid);
    if (!checked.ok) {
      setStatus('answers');
      return;
    }
    if (!captcha.ready) {
      setStatus('captcha');
      return;
    }
    setStatus('sending');
    try {
      const { data, error } = await supabase.functions.invoke('crm-lead-capture', {
        body: {
          tenantSubdomain: resolveTenantSubdomain(),
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          message: message.trim() || null,
          src,
          campaign,
          captchaToken: captcha.token,
          answers: questions.length > 0 ? answers : null,
          website: honeypot || null,
          marketingConsent: marketingPayload(marketing, lang, tenant?.name),
        },
      });
      if (error || (data && typeof data === 'object' && 'error' in data)) {
        captcha.reset();
        const fields = await invalidFieldsFrom(error, data);
        if (fields.length > 0) {
          setInvalid(fields);
          setStatus('answers');
          return;
        }
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      captcha.reset();
      setStatus('error');
    }
  };

  const wrapper = embedded ? 'w-full max-w-lg mx-auto p-4 space-y-6' : 'max-w-lg mx-auto py-8 px-4 space-y-6';

  if (status === 'sent') {
    return (
      <div className={`${wrapper} text-center`}>
        <h1 className="text-2xl font-bold">{t('pages.crm.inquire.sent_title')}</h1>
        <p role="status">{t('pages.crm.inquire.sent_message')}</p>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {embedded && tenant?.name ? t('pages.crm.inquire.embed_title', { studio: tenant.name }) : t('pages.crm.inquire.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('pages.crm.inquire.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-label={t('pages.crm.inquire.title')}>
        <div>
          <label htmlFor="inquire-name" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.name')} *
          </label>
          <input
            id="inquire-name"
            required
            autoComplete="name"
            className="w-full border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-email" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.email')}
          </label>
          <input
            id="inquire-email"
            type="email"
            autoComplete="email"
            className="w-full border rounded px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-phone" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.phone')}
          </label>
          <input
            id="inquire-phone"
            type="tel"
            autoComplete="tel"
            className="w-full border rounded px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="inquire-message" className="block text-sm font-medium mb-1">
            {t('pages.crm.inquire.message')}
          </label>
          <textarea
            id="inquire-message"
            rows={4}
            className="w-full border rounded px-3 py-2"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('pages.crm.inquire.message_placeholder')}
          />
        </div>
        <LeadQuestionFields
          questions={questions}
          values={answers}
          invalid={invalid}
          lang={lang}
          onChange={(key, value) => setAnswers((prev) => ({ ...prev, [key]: value }))}
          requiredHint={t('pages.crm.inquire.answer_required')}
          invalidHint={t('pages.crm.inquire.answer_invalid')}
        />
        {/* Honeypot — off-screen for humans, irresistible to bots. */}
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="inquire-website">Website</label>
          <input
            id="inquire-website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {status === 'error' && (
          <div className="alert-error" role="alert">
            {t('pages.crm.inquire.error')}
          </div>
        )}
        {status === 'answers' && invalid.length > 0 && (
          <div className="alert-error" role="alert">
            {t('pages.crm.inquire.answers_error')}
          </div>
        )}
        {status === 'captcha' && !captcha.ready && (
          <div className="alert-error" role="alert">
            {t('common.captcha_needed')}
          </div>
        )}

        <ConsentCheckboxes
          legend={t('legal.consents.marketing_legend')}
          kinds={MARKETING_KINDS}
          value={marketing}
          onChange={setMarketing}
          lang={lang}
          vars={{ studio: tenant?.name }}
        />

        <PrivacyNotice purpose="enquiry" />

        {captcha.widget}

        <Button type="submit" variant="primary" disabled={status === 'sending'}>
          {status === 'sending' ? t('common.loading') : t('pages.crm.inquire.submit')}
        </Button>
      </form>
    </div>
  );
}

/** Question keys the server refused (400 invalid_answers), if that is why it failed. */
async function invalidFieldsFrom(error: unknown, data: unknown): Promise<string[]> {
  const read = (body: unknown): string[] =>
    body && typeof body === 'object' && (body as { error?: unknown }).error === 'invalid_answers'
      ? ((body as { fields?: unknown }).fields as string[] | undefined)?.filter((f) => typeof f === 'string') ?? []
      : [];
  const fromData = read(data);
  if (fromData.length > 0) return fromData;
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      return read(await context.json());
    } catch {
      return [];
    }
  }
  return [];
}

function marketingPayload(state: ConsentState, lang: 'he' | 'en', studio?: string) {
  const items = MARKETING_KINDS.filter((kind) => state[kind] === true).map((kind) => ({
    kind,
    wording: consentWording(kind, lang, { studio }),
  }));
  return items.length > 0 ? { version: CONSENT_WORDING_VERSION, items } : null;
}
