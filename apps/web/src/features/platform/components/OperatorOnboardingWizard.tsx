import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
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

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = ['studio', 'type', 'payments', 'look', 'owner', 'review'] as const;
type Step = (typeof STEPS)[number];

/** Operator wizard: create a studio, invite its owner, then show what's left to set up. */
export function OperatorOnboardingWizard() {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<StudioSetupForm>(INITIAL_FORM);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<StudioSetupResult | null>(null);

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

  function canAdvance(): boolean {
    switch (step) {
      case 'studio':
        return form.name.trim().length > 0 && SUBDOMAIN_RE.test(form.subdomain.trim().toLowerCase());
      case 'look':
        return HEX_COLOR.test(form.primaryColor) && HEX_COLOR.test(form.accentColor);
      case 'owner':
        return EMAIL_RE.test(form.ownerEmail.trim());
      default:
        return true;
    }
  }

  async function handleNext() {
    setError(null);
    if (step === 'studio') {
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
      provision.mutate();
      return;
    }
    if (!canAdvance()) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  if (created) {
    return <StudioCreated result={created} ownerEmail={form.ownerEmail.trim().toLowerCase()} name={form.name.trim()} />;
  }

  const paymentLabel = (slug: StudioPaymentProvider) => t(`studio_setup.payment_${slug}`);
  const invoicingLabel = (slug: StudioInvoicingProvider) => t(`studio_setup.invoicing_${slug}`);

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('studio_setup.title')}</h1>
        <p className="text-gray-700">{t('studio_setup.description')}</p>
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
            <p id="ss-subdomain-help" className="text-xs text-gray-700">{t('studio_setup.address_help')}</p>
            {subdomainStatus === 'taken' && <p className="text-xs text-red-700" role="alert">{t('studio_setup.address_taken')}</p>}
            {subdomainStatus === 'invalid' && <p className="text-xs text-red-700" role="alert">{t('studio_setup.address_invalid')}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="ss-language">{t('studio_setup.language')}</label>
              <select id="ss-language" className="form-input w-full" value={form.languageDefault} onChange={(e) => update('languageDefault', e.target.value as 'he' | 'en')}>
                <option value="en">English</option>
                <option value="he">עברית</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="ss-country">{t('studio_setup.country')}</label>
              <select id="ss-country" className="form-input w-full" value={form.country} onChange={(e) => update('country', e.target.value as 'IL' | 'US')}>
                <option value="IL">{t('studio_setup.country_il')}</option>
                <option value="US">{t('studio_setup.country_us')}</option>
              </select>
            </div>
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
                <input type="radio" name="ss-payment" value={slug} checked={form.paymentProvider === slug} onChange={() => update('paymentProvider', slug)} />
                {paymentLabel(slug)}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('studio_setup.invoicing_question')}</legend>
            {STUDIO_INVOICING_OPTIONS.map((slug) => (
              <label key={slug} className="flex items-center gap-2">
                <input type="radio" name="ss-invoicing" value={slug} checked={form.invoicingProvider === slug} onChange={() => update('invoicingProvider', slug)} />
                {invoicingLabel(slug)}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-gray-700">{t('studio_setup.payments_later')}</p>
        </section>
      )}

      {step === 'look' && (
        <section className="space-y-4">
          <p className="text-sm text-gray-700">{t('studio_setup.look_hint')}</p>
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
            <ReviewRow label={t('studio_setup.owner_email')} value={form.ownerEmail.trim()} ltr />
          </dl>
        </section>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button variant="outline" onClick={() => { setError(null); setStepIndex((i) => Math.max(i - 1, 0)); }}>
            {t('studio_setup.back')}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={provision.isPending || checkSubdomain.isPending || !canAdvance()}
          onClick={() => void handleNext()}
        >
          {step === 'review'
            ? provision.isPending ? t('studio_setup.creating') : t('studio_setup.create')
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
