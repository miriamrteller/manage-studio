import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

type TenantPlan = 'essential' | 'professional';
type TenantVertical = 'photographer' | 'beautician' | 'dance-studio' | 'generic';
/** Stripe omitted — dormant / not for IL; adapter kept in codebase. */
type PaymentProvider = 'grow' | 'icount' | 'mock';
type InvoicingProvider = 'grow' | 'green_invoice' | 'icount';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export interface ProvisionFormState {
  name: string;
  subdomain: string;
  plan: TenantPlan;
  vertical: TenantVertical;
  primaryColor: string;
  accentColor: string;
  languageDefault: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  phoneRegion: string;
  paymentProvider: PaymentProvider;
  invoicingProvider: InvoicingProvider;
  ownerEmail: string;
}

const INITIAL_STATE: ProvisionFormState = {
  name: '',
  subdomain: '',
  plan: 'essential',
  vertical: 'generic',
  primaryColor: '#6366F1',
  accentColor: '#8B5CF6',
  languageDefault: 'he',
  country: 'IL',
  currency: 'ILS',
  phoneRegion: 'IL',
  paymentProvider: 'grow',
  invoicingProvider: 'grow',
  ownerEmail: '',
};

const STEPS = [
  'identity',
  'plan',
  'vertical',
  'branding',
  'locale',
  'tax',
  'review',
] as const;

const PLAN_OPTIONS: Array<{
  value: TenantPlan;
  title: string;
  description: string;
}> = [
  {
    value: 'essential',
    title: 'Essential',
    description:
      'Appointment-based booking. Single and deposit+ payment flows. Best for: Solo practitioners, photographers, beauticians.',
  },
  {
    value: 'professional',
    title: 'Professional',
    description:
      'Class enrollment with calendar-accurate terms, student & multi-child family billing. Best for: Dance studios, academies.',
  },
];

const VERTICAL_OPTIONS: Array<{
  value: TenantVertical;
  label: string;
  description: string;
}> = [
  {
    value: 'photographer',
    label: 'Photographer',
    description: 'Shoots & galleries, gated delivery',
  },
  {
    value: 'beautician',
    label: 'Beautician / Salon',
    description: 'Appointment booking, client cards',
  },
  {
    value: 'dance-studio',
    label: 'Dance Studio',
    description: 'Classes, terms, family billing',
  },
  {
    value: 'generic',
    label: 'Other',
    description: 'General purpose',
  },
];

export function OperatorOnboardingWizard() {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ProvisionFormState>(INITIAL_STATE);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [createdSubdomain, setCreatedSubdomain] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  const checkSubdomain = useMutation({
    mutationFn: async (subdomain: string) => {
      const { data, error: rpcError } = await supabase.rpc('check_subdomain_available', {
        p_subdomain: subdomain,
      });
      if (rpcError) throw rpcError;
      return Boolean(data);
    },
    onSuccess: (available) => {
      setSubdomainStatus(available ? 'ok' : 'taken');
    },
    onError: () => setSubdomainStatus('invalid'),
  });

  const provision = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('provision_tenant', {
        p_name: form.name.trim(),
        p_subdomain: form.subdomain.trim().toLowerCase(),
        p_plan: form.plan,
        p_vertical: form.vertical,
        p_owner_email: form.ownerEmail.trim() || null,
        p_language_default: form.languageDefault,
        p_country: form.country,
        p_currency: form.currency.trim().toUpperCase(),
        p_phone_region: form.phoneRegion.trim().toUpperCase(),
        p_payment_provider: form.paymentProvider,
        p_invoicing_provider: form.invoicingProvider,
        p_primary_color: form.primaryColor,
        p_accent_color: form.accentColor,
      });
      if (rpcError) throw rpcError;
      return data as string;
    },
    onSuccess: (tenantId) => {
      setCreatedTenantId(tenantId);
      setCreatedSubdomain(form.subdomain.trim().toLowerCase());
    },
    onError: (err: Error) => {
      setError(err.message || t('settings.onboarding.error_provision'));
    },
  });

  const grantTenantAdmin = useMutation({
    mutationFn: async () => {
      if (!createdTenantId) throw new Error('Missing tenant id');
      const email = form.ownerEmail.trim();
      if (!email) throw new Error('Enter owner email first');

      const { data: profile, error: lookupError } = await supabase
        .from('user_profiles')
        .select('id, role')
        .eq('tenant_id', createdTenantId)
        .eq('email', email)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!profile) {
        throw new Error('Owner account not found yet. Ask them to complete signup, then try again.');
      }

      const currentRoles = Array.isArray(profile.role) ? profile.role : [];
      const nextRoles = currentRoles.includes('tenant_admin')
        ? currentRoles
        : [...currentRoles, 'tenant_admin'];

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role: nextRoles })
        .eq('id', profile.id);

      if (updateError) throw updateError;
    },
  });

  function updateForm<K extends keyof ProvisionFormState>(key: K, value: ProvisionFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvance(): boolean {
    switch (step) {
      case 'identity':
        return (
          form.name.trim().length > 0 &&
          SUBDOMAIN_RE.test(form.subdomain.trim().toLowerCase()) &&
          subdomainStatus === 'ok'
        );
      case 'plan':
        return true;
      case 'vertical':
        return true;
      case 'branding':
        return HEX_COLOR.test(form.primaryColor) && HEX_COLOR.test(form.accentColor);
      case 'locale':
        return form.currency.trim().length >= 3 && form.phoneRegion.trim().length >= 2;
      case 'tax':
        return form.paymentProvider.length > 0 && form.invoicingProvider.length > 0;
      default:
        return true;
    }
  }

  async function handleNext() {
    setError(null);
    if (step === 'identity') {
      const normalized = form.subdomain.trim().toLowerCase();
      if (!SUBDOMAIN_RE.test(normalized)) {
        setSubdomainStatus('invalid');
        return;
      }
      const available = await checkSubdomain.mutateAsync(normalized);
      if (!available) {
        setSubdomainStatus('taken');
        return;
      }
      setSubdomainStatus('ok');
    }
    if (step === 'review') {
      await provision.mutateAsync();
      return;
    }
    if (!canAdvance()) return;
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function handleBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  if (createdSubdomain) {
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';
    const baseHost = host.includes('.') ? host.split('.').slice(1).join('.') : host;
    const signupUrl = `${typeof window !== 'undefined' ? window.location.protocol : 'http:'}//${createdSubdomain}.${baseHost}/signup`;

    return (
      <section className="max-w-lg space-y-4">
        <h2 className="text-xl font-semibold">{t('settings.onboarding.success_title')}</h2>
        <p role="status">
          {t('settings.onboarding.success_message', { subdomain: createdSubdomain })}
        </p>
        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3 text-sm">
          <p className="font-medium">Next steps</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Open the tenant signup page:
              <div className="mt-1">
                <a
                  className="font-mono text-xs underline break-all"
                  href={signupUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {signupUrl}
                </a>
              </div>
            </li>
            <li>
              Create the owner account
              {form.ownerEmail ? ` with ${form.ownerEmail}` : ''}.
            </li>
            <li>
              Grant <code>tenant_admin</code> role directly here:
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => grantTenantAdmin.mutate()}
                  disabled={grantTenantAdmin.isPending || !form.ownerEmail.trim()}
                >
                  {grantTenantAdmin.isPending ? 'Granting...' : 'Grant tenant_admin'}
                </Button>
                {grantTenantAdmin.isSuccess && (
                  <span className="text-xs text-green-700">Role granted successfully.</span>
                )}
              </div>
              {grantTenantAdmin.isError && (
                <p className="mt-2 text-xs text-red-600">
                  {(grantTenantAdmin.error as Error).message}
                </p>
              )}
            </li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('settings.onboarding.title')}</h1>
        <p className="text-gray-600">{t('settings.onboarding.description')}</p>
        <p className="text-sm text-muted-foreground">
          {t(`settings.onboarding.step_${step}`)} ({stepIndex + 1}/{STEPS.length})
        </p>
      </header>

      {step === 'identity' && (
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-name">
              {t('settings.onboarding.school_name')}
            </label>
            <input
              id="ob-name"
              className="form-input w-full"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-subdomain">
              {t('settings.onboarding.subdomain')}
            </label>
            <input
              id="ob-subdomain"
              className="form-input w-full font-mono"
              value={form.subdomain}
              onChange={(e) => {
                updateForm('subdomain', e.target.value.toLowerCase());
                setSubdomainStatus('idle');
              }}
              onBlur={() => {
                const s = form.subdomain.trim().toLowerCase();
                if (SUBDOMAIN_RE.test(s)) void checkSubdomain.mutate(s);
                else setSubdomainStatus('invalid');
              }}
            />
            <p className="text-xs text-muted-foreground">{t('settings.onboarding.subdomain_help')}</p>
            {subdomainStatus === 'ok' && (
              <p className="text-xs text-green-700">{t('settings.onboarding.subdomain_available')}</p>
            )}
            {subdomainStatus === 'taken' && (
              <p className="text-xs text-red-600">{t('settings.onboarding.subdomain_taken')}</p>
            )}
          </div>
        </section>
      )}

      {step === 'plan' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLAN_OPTIONS.map((option) => {
            const selected = form.plan === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`text-left rounded-xl p-4 transition ${
                  selected
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border border-border cursor-pointer hover:border-primary/50'
                }`}
                onClick={() => updateForm('plan', option.value)}
              >
                <h3 className="text-base font-semibold">✦ {option.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </section>
      )}

      {step === 'vertical' && (
        <section className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {VERTICAL_OPTIONS.map((option) => {
              const selected = form.vertical === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`text-left rounded-xl p-4 transition ${
                    selected
                      ? 'border-2 border-primary bg-primary/5'
                      : 'border border-border cursor-pointer hover:border-primary/50'
                  }`}
                  onClick={() => updateForm('vertical', option.value)}
                >
                  <h3 className="text-base font-semibold">{option.label}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Dance Studio automatically uses the Professional layout. Other verticals use Essential
            by default.
          </p>
        </section>
      )}

      {step === 'branding' && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">{t('settings.onboarding.primary_color')}</label>
            <input
              type="color"
              className="h-10 w-14"
              value={form.primaryColor}
              onChange={(e) => updateForm('primaryColor', e.target.value)}
            />
            <input
              className="form-input font-mono"
              value={form.primaryColor}
              onChange={(e) => updateForm('primaryColor', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">{t('settings.onboarding.accent_color')}</label>
            <input
              type="color"
              className="h-10 w-14"
              value={form.accentColor}
              onChange={(e) => updateForm('accentColor', e.target.value)}
            />
            <input
              className="form-input font-mono"
              value={form.accentColor}
              onChange={(e) => updateForm('accentColor', e.target.value)}
            />
          </div>
        </section>
      )}

      {step === 'locale' && (
        <section className="space-y-4 max-w-md">
          <select
            className="form-input w-full"
            value={form.languageDefault}
            onChange={(e) => updateForm('languageDefault', e.target.value as 'he' | 'en')}
          >
            <option value="he">{t('settings.hub.language_he')}</option>
            <option value="en">{t('settings.hub.language_en')}</option>
          </select>
          <select
            className="form-input w-full"
            value={form.country}
            onChange={(e) => updateForm('country', e.target.value as 'IL' | 'US')}
          >
            <option value="IL">{t('settings.hub.country_il')}</option>
            <option value="US">{t('settings.hub.country_us')}</option>
          </select>
          <input
            className="form-input w-full"
            value={form.currency}
            onChange={(e) => updateForm('currency', e.target.value)}
            maxLength={3}
          />
          <input
            className="form-input w-full"
            value={form.phoneRegion}
            onChange={(e) => updateForm('phoneRegion', e.target.value)}
            maxLength={2}
          />
        </section>
      )}

      {step === 'tax' && (
        <section className="space-y-4 max-w-md">
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-payment-provider">
              Payment provider
            </label>
            <select
              id="ob-payment-provider"
              className="form-input w-full"
              value={form.paymentProvider}
              onChange={(e) => updateForm('paymentProvider', e.target.value as PaymentProvider)}
            >
              <option value="grow">Grow</option>
              <option value="icount">iCount</option>
              <option value="mock">Mock (testing)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-invoicing-provider">
              Invoice provider
            </label>
            <select
              id="ob-invoicing-provider"
              className="form-input w-full"
              value={form.invoicingProvider}
              onChange={(e) => updateForm('invoicingProvider', e.target.value as InvoicingProvider)}
            >
              <option value="grow">Grow</option>
              <option value="green_invoice">Green Invoice</option>
              <option value="icount">iCount</option>
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            You can change providers later in tenant settings.
          </p>
        </section>
      )}

      {step === 'review' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t('settings.onboarding.review_title')}</h2>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('settings.onboarding.school_name')}</dt>
              <dd>{form.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t('settings.onboarding.subdomain')}</dt>
              <dd className="font-mono">{form.subdomain}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="capitalize">{form.plan}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Vertical</dt>
              <dd className="capitalize">{form.vertical.replace('-', ' ')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment provider</dt>
              <dd className="capitalize">{form.paymentProvider.replace('_', ' ')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Invoice provider</dt>
              <dd className="capitalize">{form.invoicingProvider.replace('_', ' ')}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-owner-email">
              {t('settings.onboarding.admin_email')}
            </label>
            <input
              id="ob-owner-email"
              type="email"
              className="form-input w-full"
              value={form.ownerEmail}
              onChange={(e) => updateForm('ownerEmail', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('settings.onboarding.admin_email_help')}</p>
          </div>
        </section>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {stepIndex > 0 && (
          <Button variant="outline" onClick={handleBack}>
            {t('settings.onboarding.back')}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={provision.isPending || checkSubdomain.isPending}
          onClick={() => void handleNext()}
        >
          {step === 'review'
            ? provision.isPending
              ? t('settings.onboarding.provisioning')
              : t('settings.onboarding.provision')
            : t('settings.onboarding.next')}
        </Button>
      </div>
    </div>
  );
}
