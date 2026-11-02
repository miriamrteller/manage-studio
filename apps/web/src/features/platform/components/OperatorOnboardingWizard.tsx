import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ColourPresets } from '@/components/colour/ColourPresets';
import { Alert } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';
import {
  createStudio,
  resendOwnerInvite,
  STUDIO_INVOICING_OPTIONS,
  STUDIO_PAYMENT_OPTIONS,
  type OwnerInviteStatus,
  type StudioInvoicingProvider,
  type StudioPaymentProvider,
  type StudioSetupResult,
} from '../services/studioSetupService';
import { INITIAL_FORM, toSetupRequest, VERTICALS, type StudioSetupForm } from '../lib/studioSetupForm';
import { invoicingOptionsFor, invoicingPairsWithPayment } from '@/lib/providerPairing';

/** Invoicing that only issues documents with its own card payments (no cash receipts). */
const BUNDLED_ONLY_INVOICING: readonly string[] = ['grow', 'icount', 'invoice4u'];
import { platformTermsVersion } from '@/legal/acceptance';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import { TurnstileWidget } from '@/components/captcha/TurnstileWidget';
import {
  createSelfServeStudio,
  turnstileSiteKey,
  type SelfServeStudioResult,
} from '@/features/self-serve/selfServeSignup';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OPERATOR_STEPS = ['studio', 'type', 'payments', 'look', 'owner', 'review'] as const;
/** Self-serve: the owner is the signed-in account, and the address comes after the look. */
const SELF_SERVE_STEPS = ['studio', 'type', 'payments', 'look', 'address', 'review'] as const;
type Step = (typeof OPERATOR_STEPS)[number] | (typeof SELF_SERVE_STEPS)[number];

export type WizardMode = 'operator' | 'self_serve';

interface WizardProps {
  /**
   * operator (default): the platform owner creates a studio and invites its owner.
   * self_serve: a signed-in account creates its own studio (free beta) and accepts the terms.
   */
  mode?: WizardMode;
  /** self_serve: called with the new studio. */
  onSelfServeCreated?: (result: SelfServeStudioResult, name: string) => void;
}

const SELF_SERVE_ERRORS: Record<string, string> = {
  account_has_studio: 'self_serve.error_account_has_studio',
  email_not_confirmed: 'self_serve.error_email_not_confirmed',
  captcha_failed: 'self_serve.error_captcha',
  self_serve_disabled: 'self_serve.error_disabled',
  subdomain_unavailable: 'studio_setup.address_taken',
};

/** Operator wizard: create a studio, invite its owner, then show what's left to set up. */
/** The invoicing service named like the payment choice, when the two work together. */
function matchingInvoicingFor(payment: StudioPaymentProvider): StudioInvoicingProvider | null {
  return (STUDIO_INVOICING_OPTIONS as readonly string[]).includes(payment) && invoicingPairsWithPayment(payment, payment)
    ? (payment as StudioInvoicingProvider)
    : null;
}

/** Invoicing services, other than the matching one and "none", that work with this payment choice. */
function otherInvoicingFor(payment: StudioPaymentProvider): StudioInvoicingProvider[] {
  const matching = matchingInvoicingFor(payment);
  return invoicingOptionsFor(payment).filter(
    (slug): slug is StudioInvoicingProvider =>
      slug !== 'none' && slug !== matching && (STUDIO_INVOICING_OPTIONS as readonly string[]).includes(slug),
  );
}

export function OperatorOnboardingWizard({ mode = 'operator', onSelfServeCreated }: WizardProps = {}) {
  const { t, i18n } = useTranslation();
  const selfServe = mode === 'self_serve';
  const STEPS: readonly Step[] = selfServe ? SELF_SERVE_STEPS : OPERATOR_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<StudioSetupForm>(INITIAL_FORM);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StudioSetupResult | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [invoicingOther, setInvoicingOther] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const siteKey = selfServe ? turnstileSiteKey() : null;

  const step: Step = STEPS[stepIndex];

  const checkSubdomain = useMutation({
    mutationFn: async (subdomain: string) => {
      const { data, error: rpcError } = await supabase.rpc('check_subdomain_available', {
        p_subdomain: subdomain,
      });
      if (rpcError) throw rpcError;
      return Boolean(data);
    },
  });

  // Self-serve: check the address as the owner types (operator checks on Next).
  const liveSubdomain = form.subdomain.trim().toLowerCase();
  const checkLive = selfServe && step === 'address';
  useEffect(() => {
    if (!checkLive) return;
    if (!liveSubdomain) {
      setSubdomainStatus('idle');
      return;
    }
    if (!SUBDOMAIN_RE.test(liveSubdomain)) {
      setSubdomainStatus('invalid');
      return;
    }
    const timer = window.setTimeout(() => {
      checkSubdomain.mutate(liveSubdomain, {
        onSuccess: (available) => setSubdomainStatus(available ? 'ok' : 'taken'),
      });
    }, 400);
    return () => window.clearTimeout(timer);
    // checkSubdomain is a stable mutation object; re-run only for a new address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkLive, liveSubdomain]);

  const selfServeCreate = useMutation({
    mutationFn: async () => {
      // The owner is the signed-in account: no owner email is sent.
      const request: Partial<ReturnType<typeof toSetupRequest>> = toSetupRequest(form);
      delete request.ownerEmail;
      return createSelfServeStudio({
        ...(request as Omit<ReturnType<typeof toSetupRequest>, 'ownerEmail'>),
        termsVersion: await platformTermsVersion(),
        termsLanguage: i18n.language.startsWith('he') ? 'he' : 'en',
        ...(captchaToken ? { captchaToken } : {}),
      });
    },
    onSuccess: (result) => onSelfServeCreated?.(result, form.name.trim()),
    onError: (err: Error) => {
      const key = SELF_SERVE_ERRORS[err.message];
      if (err.message === 'subdomain_unavailable') setSubdomainStatus('taken');
      setError(key ? t(key) : t('studio_setup.error_create'));
    },
  });

  const provision = useMutation({
    mutationFn: () => createStudio(toSetupRequest(form)),
    onSuccess: (result) => setCreated(result),
    onError: (err: Error) => {
      setError(
        err.message === 'email_in_other_studio'
          ? t('studio_setup.owner_in_other_studio')
          : err.message === 'email_is_platform_owner'
            ? t('studio_setup.owner_is_platform_owner')
            : err.message || t('studio_setup.error_create'),
      );
    },
  });

  function update<K extends keyof StudioSetupForm>(key: K, value: StudioSetupForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** The invoicing service that goes with this payment choice (Grow -> Grow documents). */
  const matchingInvoicing = matchingInvoicingFor(form.paymentProvider);
  /** Other invoicing services that can issue documents for this payment choice. */
  const otherInvoicing = otherInvoicingFor(form.paymentProvider);

  /**
   * Documents follow the payment choice, unless the owner said they use another invoicing
   * service and that service still works with the new payment choice.
   */
  function choosePayment(slug: StudioPaymentProvider) {
    const keepOther = invoicingOther && otherInvoicingFor(slug).includes(form.invoicingProvider);
    if (invoicingOther && !keepOther) setInvoicingOther(false);
    setForm((prev) => ({
      ...prev,
      paymentProvider: slug,
      invoicingProvider: keepOther ? prev.invoicingProvider : matchingInvoicingFor(slug) ?? 'none',
    }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'studio':
        if (selfServe) return form.name.trim().length > 0;
        return form.name.trim().length > 0 && SUBDOMAIN_RE.test(form.subdomain.trim().toLowerCase());
      case 'address':
        return SUBDOMAIN_RE.test(form.subdomain.trim().toLowerCase()) && subdomainStatus !== 'taken';
      case 'look':
        return HEX_COLOR.test(form.primaryColor) && HEX_COLOR.test(form.accentColor);
      case 'owner':
        return EMAIL_RE.test(form.ownerEmail.trim());
      case 'payments':
        return invoicingPairsWithPayment(form.paymentProvider, form.invoicingProvider);
      case 'review':
        return !selfServe || (termsAccepted && (!siteKey || Boolean(captchaToken)));
      default:
        return true;
    }
  }

  /** Why Next is greyed out, in plain words (empty when it is not). */
  function missingHintKey(): string | null {
    if (canAdvance()) return null;
    switch (step) {
      case 'studio':
        return form.name.trim().length === 0 ? 'studio_setup.need_name' : 'studio_setup.need_address';
      case 'address':
        return subdomainStatus === 'taken' ? null : 'studio_setup.need_address';
      case 'look':
        return 'studio_setup.need_colours';
      case 'owner':
        return 'studio_setup.need_owner_email';
      case 'payments':
        return 'studio_setup.need_invoicing_pairing';
      case 'review':
        return !termsAccepted ? 'studio_setup.need_terms' : 'self_serve.captcha_needed';
      default:
        return null;
    }
  }
  const missingHint = missingHintKey();

  async function handleNext() {
    setError(null);
    if ((step === 'studio' && !selfServe) || step === 'address') {
      const subdomain = form.subdomain.trim().toLowerCase();
      if (!SUBDOMAIN_RE.test(subdomain)) {
        setSubdomainStatus('invalid');
        return;
      }
      try {
        const available = await checkSubdomain.mutateAsync(subdomain);
        setSubdomainStatus(available ? 'ok' : 'taken');
        if (!available) return;
      } catch {
        setError(t('studio_setup.error_check_address'));
        return;
      }
    }
    if (step === 'review') {
      if (selfServe) selfServeCreate.mutate();
      else provision.mutate();
      return;
    }
    if (!canAdvance()) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  if (created) {
    return <StudioCreated result={created} ownerEmail={form.ownerEmail.trim().toLowerCase()} name={form.name.trim()} />;
  }

  const paymentLabel = (slug: StudioPaymentProvider) => t(`studio_setup.payment_${slug}`);
  const isPending = provision.isPending || selfServeCreate.isPending;

  const subdomainField = (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor="ss-subdomain">{t('studio_setup.address')}</label>
      <div className="flex items-center gap-2" dir="ltr">
        <input
          id="ss-subdomain"
          className="form-input w-full font-mono"
          value={form.subdomain}
          aria-describedby="ss-subdomain-help"
          onChange={(e) => {
            update('subdomain', e.target.value.toLowerCase());
            setSubdomainStatus('idle');
          }}
        />
        <span className="shrink-0 text-sm text-gray-700">.{tenantOrigin('x').replace(/^https?:\/\/x\./, '')}</span>
      </div>
      <p id="ss-subdomain-help" className="text-xs text-gray-700">
        {t('studio_setup.address_help')}{' '}
        {t('studio_setup.address_example', {
          example: `my-studio → my-studio.${tenantOrigin('x').replace(/^https?:\/\/x\./, '')}`,
        })}
      </p>
      {subdomainStatus === 'taken' && <p className="text-xs text-red-700" role="alert">{t('studio_setup.address_taken')}</p>}
      {selfServe && subdomainStatus === 'ok' && (
        <p className="text-xs text-green-800" role="status">{t('self_serve.address_available')}</p>
      )}
      {subdomainStatus === 'invalid' && <p className="text-xs text-red-700" role="alert">{t('studio_setup.address_invalid')}</p>}
    </div>
  );
  const invoicingLabel = (slug: StudioInvoicingProvider) => t(`studio_setup.invoicing_${slug}`);

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t(selfServe ? 'self_serve.wizard_title' : 'studio_setup.title')}</h1>
        <p className="text-gray-700">{t(selfServe ? 'self_serve.wizard_description' : 'studio_setup.description')}</p>
        <p className="text-sm text-gray-700">
          {t('studio_setup.step_counter', { current: stepIndex + 1, total: STEPS.length })}
          {' · '}
          {t(`studio_setup.step_${step}`)}
        </p>
      </header>

      {step === 'studio' && (
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ss-name">{t('studio_setup.name')}</label>
            <input id="ss-name" className="form-input w-full" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          {!selfServe && subdomainField}
          {/* The studio's country is Israel (sent as IL); only the main language is a choice. */}
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ss-language">{t('studio_setup.language')}</label>
            <select id="ss-language" className="form-input w-full" value={form.languageDefault} onChange={(e) => update('languageDefault', e.target.value as 'he' | 'en')}>
              <option value="en">English</option>
              <option value="he">עברית</option>
            </select>
          </div>
        </section>
      )}

      {step === 'type' && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{t('studio_setup.type_question')}</legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {VERTICALS.map((vertical) => (
              <label
                key={vertical}
                className={`cursor-pointer rounded-xl p-4 ${form.vertical === vertical ? 'border-2 border-primary bg-primary/5' : 'border border-border'}`}
              >
                <input
                  type="radio"
                  name="ss-vertical"
                  className="sr-only"
                  checked={form.vertical === vertical}
                  onChange={() => update('vertical', vertical)}
                />
                <span className="block font-semibold">{t(`studio_setup.vertical_${vertical}`)}</span>
                <span className="mt-1 block text-sm text-gray-700">{t(`studio_setup.vertical_${vertical}_hint`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {step === 'payments' && (
        <section className="space-y-6">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('studio_setup.payment_question')}</legend>
            {STUDIO_PAYMENT_OPTIONS.map((slug) => (
              <label key={slug} className="flex items-center gap-2">
                <input type="radio" name="ss-payment" value={slug} checked={form.paymentProvider === slug} onChange={() => choosePayment(slug)} />
                {paymentLabel(slug)}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('studio_setup.invoicing_question')}</legend>
            {matchingInvoicing && (
              <label className="flex items-center gap-2">
                <input type="radio" name="ss-invoicing-mode" value="match" checked={!invoicingOther && form.invoicingProvider === matchingInvoicing} onChange={() => { setInvoicingOther(false); update('invoicingProvider', matchingInvoicing); }} />
                {invoicingLabel(matchingInvoicing)}
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="radio" name="ss-invoicing-mode" value="none" checked={!invoicingOther && form.invoicingProvider === 'none'} onChange={() => { setInvoicingOther(false); update('invoicingProvider', 'none'); }} />
              {invoicingLabel('none')}
            </label>
            {otherInvoicing.length > 0 && (
              <label className="flex items-center gap-2">
                <input type="radio" name="ss-invoicing-mode" value="other" checked={invoicingOther} onChange={() => { setInvoicingOther(true); if (!otherInvoicing.includes(form.invoicingProvider)) update('invoicingProvider', otherInvoicing[0]); }} />
                {t('studio_setup.invoicing_existing')}
              </label>
            )}
            {invoicingOther && otherInvoicing.length > 0 && (
              <div className="ms-6 space-y-2" role="group" aria-label={t('studio_setup.invoicing_existing_which')}>
                {otherInvoicing.map((slug) => (
                  <label key={slug} className="flex items-center gap-2">
                    <input type="radio" name="ss-invoicing" value={slug} checked={form.invoicingProvider === slug} onChange={() => update('invoicingProvider', slug)} />
                    {invoicingLabel(slug)}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          {BUNDLED_ONLY_INVOICING.includes(form.invoicingProvider) && (
            <p className="text-sm text-gray-700" role="note">
              {t('studio_setup.cash_receipts_hint', { provider: t(`settings.provider_names.${form.invoicingProvider}`) })}
            </p>
          )}
                    <p className="text-sm text-gray-700">{t('studio_setup.payments_later')}</p>
        </section>
      )}

      {step === 'look' && (
        <section className="space-y-4">
          <p className="text-sm text-gray-700">{t('studio_setup.look_hint')}</p>
          <ColourPresets
            primary={form.primaryColor}
            accent={form.accentColor}
            onPick={(primary, accent) => setForm((f) => ({ ...f, primaryColor: primary, accentColor: accent }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(['primaryColor', 'accentColor'] as const).map((key) => (
              <div key={key} className="space-y-2">
                <label className="block text-sm font-medium" htmlFor={`ss-${key}`}>
                  {t(key === 'primaryColor' ? 'studio_setup.primary_color' : 'studio_setup.accent_color')}
                </label>
                <div className="flex items-center gap-2" dir="ltr">
                  <input type="color" aria-hidden="true" tabIndex={-1} className="h-10 w-14" value={form[key]} onChange={(e) => update(key, e.target.value)} />
                  <input id={`ss-${key}`} className="form-input font-mono" value={form[key]} onChange={(e) => update(key, e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 'address' && <section className="space-y-4">{subdomainField}</section>}

      {step === 'owner' && (
        <section className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ss-owner">{t('studio_setup.owner_email')}</label>
          <input
            id="ss-owner"
            type="email"
            dir="ltr"
            className="form-input w-full"
            value={form.ownerEmail}
            aria-describedby="ss-owner-help"
            onChange={(e) => update('ownerEmail', e.target.value)}
          />
          <p id="ss-owner-help" className="text-sm text-gray-700">
            {t('studio_setup.owner_help')} {t('studio_setup.owner_not_platform')}
          </p>
        </section>
      )}

      {step === 'review' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t('studio_setup.review_title')}</h2>
          <dl className="space-y-1 text-sm">
            <ReviewRow label={t('studio_setup.name')} value={form.name} />
            <ReviewRow label={t('studio_setup.address')} value={tenantOrigin(form.subdomain.trim().toLowerCase()).replace(/^https?:\/\//, '')} ltr />
            <ReviewRow label={t('studio_setup.language')} value={form.languageDefault === 'he' ? 'עברית' : 'English'} />
            <ReviewRow label={t('studio_setup.step_type')} value={t(`studio_setup.vertical_${form.vertical}`)} />
            <ReviewRow label={t('studio_setup.payment_question')} value={paymentLabel(form.paymentProvider)} />
            <ReviewRow label={t('studio_setup.invoicing_question')} value={invoicingLabel(form.invoicingProvider)} />
            {!selfServe && <ReviewRow label={t('studio_setup.owner_email')} value={form.ownerEmail.trim()} ltr />}
          </dl>
          {selfServe && (
            <div className="space-y-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  {t('self_serve.terms_prefix')}{' '}
                  <Link to="/legal/platform-terms" target="_blank" rel="noopener noreferrer" className="underline">
                    {t('legal.docs.platform_terms')}
                  </Link>
                  {', '}
                  <Link to="/legal/dpa" target="_blank" rel="noopener noreferrer" className="underline">
                    {t('legal.docs.dpa')}
                  </Link>
                  {` ${t('self_serve.terms_and')} `}
                  <Link to="/legal/opalswift-privacy" target="_blank" rel="noopener noreferrer" className="underline">
                    {t('legal.docs.opalswift_privacy')}
                  </Link>
                  .
                </span>
              </label>
              <p className="text-sm text-gray-700">{t('self_serve.free_beta_note')}</p>
              {siteKey && (
                <TurnstileWidget
                  siteKey={siteKey}
                  language={i18n.language.startsWith('he') ? 'he' : 'en'}
                  onToken={setCaptchaToken}
                />
              )}
            </div>
          )}
        </section>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      {missingHint && (
        <p id="ss-next-hint" className="text-sm text-gray-700" role="status">{t(missingHint)}</p>
      )}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button variant="outline" onClick={() => { setError(null); setStepIndex((i) => Math.max(i - 1, 0)); }}>
            {t('studio_setup.back')}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={isPending || checkSubdomain.isPending || !canAdvance()}
          aria-describedby={missingHint ? 'ss-next-hint' : undefined}
          onClick={() => void handleNext()}
        >
          {step === 'review'
            ? isPending ? t('studio_setup.creating') : t('studio_setup.create')
            : t('studio_setup.next')}
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-700">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className={ltr ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}

const CHECKLIST = ['branding', 'classes', 'legal', 'sender', 'test_enrolment', 'lawyer'] as const;

function StudioCreated({ result, ownerEmail, name }: { result: StudioSetupResult; ownerEmail: string; name: string }) {
  const { t } = useTranslation();
  const [owner, setOwner] = useState<OwnerInviteStatus>(result.owner);
  const resend = useMutation({
    mutationFn: () => resendOwnerInvite(result.tenantId, ownerEmail),
    onSuccess: setOwner,
  });
  const origin = tenantOrigin(result.subdomain);

  return (
    <section className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">{t('studio_setup.created_title', { name })}</h1>
      <ul className="space-y-2">
        <li>
          {t('studio_setup.created_address')}{' '}
          <a className="underline" dir="ltr" href={origin} target="_blank" rel="noreferrer noopener">{origin.replace(/^https?:\/\//, '')}</a>
        </li>
        <li>
          <a className="underline" href={`${origin}/admin/setup`} target="_blank" rel="noreferrer noopener">{t('studio_setup.created_admin_link')}</a>
        </li>
      </ul>

      <div role="status" className="rounded-md border border-border p-4 text-sm">
        {owner.status === 'invited' && t('studio_setup.owner_invited', { email: ownerEmail })}
        {owner.status === 'already_owner' && t('studio_setup.owner_already', { email: ownerEmail })}
        {owner.status === 'failed' && (
          <div className="space-y-2">
            <p className="text-red-700">
              {owner.reason === 'email_in_other_studio'
                ? t('studio_setup.owner_in_other_studio')
                : owner.reason === 'email_is_platform_owner'
                  ? t('studio_setup.owner_is_platform_owner')
                  : t('studio_setup.owner_invite_failed', { email: ownerEmail })}
            </p>
            {owner.reason === 'invite_failed' && (
              <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
                {t('studio_setup.owner_resend')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Drafts notice and the PDF; the studio's own admin confirms when they sign in. */}
      <LegalPackPanel tenantId={result.tenantId} mode="notice" />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('studio_setup.next_title')}</h2>
        <ol className="list-decimal space-y-1 ps-5">
          {CHECKLIST.map((item) => (
            <li key={item}>{t(`studio_setup.next_${item}`)}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
