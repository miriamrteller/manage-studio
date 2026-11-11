import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadFormInvite } from '../hooks/useLeadFormInvite';
import { useTranslation } from 'react-i18next';
import { ConsentCheckboxes } from '@/components/legal/ConsentCheckboxes';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { Button } from '@/components/ui/button';
import { useCaptcha } from '@/components/captcha/useCaptcha';
import { useTenant } from '@/hooks/useTenant';
import { useFillWhenEmpty, useSignedInPrefill } from '@/hooks/useSignedInPrefill';
import { CONSENT_WORDING_VERSION, MARKETING_KINDS, consentWording, type ConsentState } from '@/legal/consents';
import { useLegalLang } from '@/legal/useLegalDocument';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import { readInquiryTags } from '../lib/inquiryTags';
import { validateLeadAnswers, type NamedFormPublic } from '@shared/index';
import { useLeadFormQuestions } from '../hooks/useLeadFormQuestions';
import { LeadQuestionFields } from './LeadQuestionFields';

/**
 * Public enquiry form — the "website" capture channel, and via ?src= tags the
 * landing spot for every social capture link (Instagram bio, WhatsApp status,
 * LinkedIn) — docs/plans/crm-lead-capture-channels.md. Rendered on /inquire
 * and, without the app chrome, on /embed/inquire (iframe on the studio's own
 * site). Posts to the public crm-lead-capture edge function; no login.
 *
 * Spam: hidden `website` honeypot, a time trap (elapsedMs), Turnstile when
 * VITE_TURNSTILE_SITE_KEY is set (checked server-side), the server's spam
 * check on the name and message, and the server's rate limit. Marketing opt-ins
 * are never pre-ticked and are sent separately from the source/campaign tags.
 */
export function InquiryForm({
  embedded = false,
  namedForm = null,
}: {
  embedded?: boolean;
  /** A named form (/f/<slug>): its own title, intro, image, question subset and class/package. */
  namedForm?: NamedFormPublic | null;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { src, campaign } = readInquiryTags(searchParams);
  const captcha = useCaptcha();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Signed in: start from what OpalSwift already knows (only empty fields; still editable).
  const known = useSignedInPrefill();
  useFillWhenEmpty(known.name, setName);
  useFillWhenEmpty(known.email, setEmail);
  useFillWhenEmpty(known.phone, setPhone);
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [marketing, setMarketing] = useState<ConsentState>({});
  const lang = useLegalLang();
  const tenant = useTenant();
  // An admin's "Send form" link: start with the name and email they typed.
  const invite = useLeadFormInvite(tenant?.id);
  useEffect(() => {
    if (!invite.prefill) return;
    const { name: invitedName, email: invitedEmail } = invite.prefill;
    setName((v) => v || invitedName);
    setEmail((v) => v || invitedEmail);
  }, [invite.prefill]);
  // The class example only for studios that teach classes; a general one for everyone else.
  const teachesClasses = (tenant?.profile?.teachesClasses ?? true) && tenant?.vertical !== 'photographer';
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error' | 'captcha' | 'answers' | 'spam' | 'own_email'>('idle');
  // Time trap: when the form first showed (the server ignores enquiries sent within seconds).
  const [shownAt] = useState(() => Date.now());
  const { questions } = useLeadFormQuestions(namedForm?.question_keys ?? null);
  // A form made for one class or package starts with it chosen.
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    namedForm?.offering_id ? { class_interest: namedForm.offering_id } : {},
  );
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
          answers: questions.length > 0 ? pickAnswers(answers, questions.map((q) => q.key)) : null,
          formSlug: namedForm?.slug ?? null,
          invite: invite.token,
          website: honeypot || null,
          elapsedMs: Date.now() - shownAt,
          marketingConsent: marketingPayload(marketing, lang, tenant?.name),
        },
      });
      if (error || (data && typeof data === 'object' && 'error' in data)) {
        captcha.reset();
        const body = await errorBodyFrom(error, data);
        const fields = invalidFieldsFrom(body);
        if (fields.length > 0) {
          setInvalid(fields);
          setStatus('answers');
          return;
        }
        setStatus(refusedAsSpam(body) ? 'spam' : refusedAsOwnEmail(body) ? 'own_email' : 'error');
        return;
      }
      setStatus('sent');
    } catch {
      captcha.reset();
      setStatus('error');
    }
  };

  const namedTitle = namedForm ? (lang === 'he' ? namedForm.title_he || namedForm.title_en : namedForm.title_en || namedForm.title_he) : null;
  const namedIntro = namedForm ? (lang === 'he' ? namedForm.intro_he || namedForm.intro_en : namedForm.intro_en || namedForm.intro_he) : null;
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
        {namedForm?.image_url && (
          <img src={namedForm.image_url} alt="" className="w-full max-h-56 object-cover rounded" loading="lazy" />
        )}
        <h1 className="text-2xl font-bold" dir="auto">
          {namedTitle ||
            (embedded && tenant?.name ? t('pages.crm.inquire.embed_title', { studio: tenant.name }) : t('pages.crm.inquire.title'))}
        </h1>
        <p className="text-sm text-muted-foreground whitespace-pre-line" dir="auto">
          {namedIntro || t('pages.crm.inquire.subtitle')}
        </p>
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
            placeholder={t(
              teachesClasses ? 'pages.crm.inquire.message_placeholder_classes' : 'pages.crm.inquire.message_placeholder',
            )}
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
        {status === 'spam' && (
          <div className="alert-error" role="alert">
            {t('pages.crm.inquire.spam_error')}
          </div>
        )}
        {status === 'own_email' && (
          <div className="alert-error" role="alert">
            {t('pages.crm.inquire.own_email_error')}
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

/** Only the answers to questions on this form (a pre-chosen class the form doesn't ask about is the server's to apply). */
function pickAnswers(answers: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(answers).filter(([k]) => keys.includes(k)));
}

/** The server's JSON answer when it refused the enquiry (read once: the body is a stream). */
async function errorBodyFrom(error: unknown, data: unknown): Promise<unknown> {
  if (data && typeof data === 'object' && 'error' in data) return data;
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      return null;
    }
  }
  return null;
}

/** Question keys the server refused (400 invalid_answers), if that is why it failed. */
function invalidFieldsFrom(body: unknown): string[] {
  return body && typeof body === 'object' && (body as { error?: unknown }).error === 'invalid_answers'
    ? ((body as { fields?: unknown }).fields as string[] | undefined)?.filter((f) => typeof f === 'string') ?? []
    : [];
}

/** The server's spam check refused it (422 looks_like_spam). */
function refusedAsSpam(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { error?: unknown }).error === 'looks_like_spam';
}

/** Sent with the studio's own email (422 own_studio_email): someone at the studio trying the form. */
function refusedAsOwnEmail(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { error?: unknown }).error === 'own_studio_email';
}

function marketingPayload(state: ConsentState, lang: 'he' | 'en', studio?: string) {
  const items = MARKETING_KINDS.filter((kind) => state[kind] === true).map((kind) => ({
    kind,
    wording: consentWording(kind, lang, { studio }),
  }));
  return items.length > 0 ? { version: CONSENT_WORDING_VERSION, items } : null;
}
