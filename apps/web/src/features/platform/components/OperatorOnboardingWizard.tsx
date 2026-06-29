import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  resolveEntityLabels,
  type BusinessPreset,
  type EntityKey,
} from '@shared/index';

const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const ENTITY_KEYS: EntityKey[] = [
  'contact',
  'account',
  'offering',
  'season',
  'category',
  'staff',
  'engagement',
  'session',
];

export interface ProvisionFormState {
  name: string;
  subdomain: string;
  businessPreset: BusinessPreset;
  labelOverrides: Partial<Record<EntityKey, { singular: string; plural: string }>>;
  primaryColor: string;
  accentColor: string;
  languageDefault: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  phoneRegion: string;
  vatRatePercent: string;
  pricesIncludeVat: boolean;
  adminEmail: string;
}

const INITIAL_STATE: ProvisionFormState = {
  name: '',
  subdomain: '',
  businessPreset: 'programs',
  labelOverrides: {},
  primaryColor: '#76335a',
  accentColor: '#e99ac4',
  languageDefault: 'he',
  country: 'IL',
  currency: 'ILS',
  phoneRegion: 'IL',
  vatRatePercent: '17',
  pricesIncludeVat: true,
  adminEmail: '',
};

const STEPS = [
  'identity',
  'terminology',
  'branding',
  'locale',
  'tax',
  'integrations',
  'starter',
  'review',
] as const;

export function OperatorOnboardingWizard() {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<ProvisionFormState>(INITIAL_STATE);
  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'ok' | 'taken' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [createdSubdomain, setCreatedSubdomain] = useState<string | null>(null);

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
      const labelsPayload: Record<string, { singular: string; plural: string }> = {};
      for (const key of ENTITY_KEYS) {
        const pair = form.labelOverrides[key];
        if (pair?.singular?.trim() && pair?.plural?.trim()) {
          labelsPayload[key] = {
            singular: pair.singular.trim(),
            plural: pair.plural.trim(),
          };
        }
      }

      const { data, error: rpcError } = await supabase.rpc('provision_tenant', {
        p_name: form.name.trim(),
        p_subdomain: form.subdomain.trim().toLowerCase(),
        p_business_preset: form.businessPreset,
        p_labels: labelsPayload,
        p_primary_color: form.primaryColor,
        p_accent_color: form.accentColor,
        p_language_default: form.languageDefault,
        p_country: form.country,
        p_currency: form.currency.trim().toUpperCase(),
        p_phone_region: form.phoneRegion.trim().toUpperCase(),
        p_vat_rate: 0,
        p_prices_include_vat: true,
        p_admin_email: form.adminEmail.trim() || null,
      });
      if (rpcError) throw rpcError;
      return data as string;
    },
    onSuccess: () => {
      setCreatedSubdomain(form.subdomain.trim().toLowerCase());
    },
    onError: (err: Error) => {
      setError(err.message || t('settings.onboarding.error_provision'));
    },
  });

  const defaultLabels = resolveEntityLabels(form.businessPreset);

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
      case 'terminology':
      case 'branding':
        return HEX_COLOR.test(form.primaryColor) && HEX_COLOR.test(form.accentColor);
      case 'locale':
        return form.currency.trim().length >= 3 && form.phoneRegion.trim().length >= 2;
      case 'tax': {
        const v = Number(form.vatRatePercent);
        return !Number.isNaN(v) && v >= 0 && v <= 100;
      }
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
    return (
      <section className="max-w-lg space-y-4">
        <h2 className="text-xl font-semibold">{t('settings.onboarding.success_title')}</h2>
        <p role="status">
          {t('settings.onboarding.success_message', { subdomain: createdSubdomain })}
        </p>
        {form.adminEmail && (
          <p className="text-sm text-muted-foreground">
            {t('settings.onboarding.admin_email_help')} {form.adminEmail}
          </p>
        )}
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
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-preset">
              {t('settings.onboarding.business_preset')}
            </label>
            <select
              id="ob-preset"
              className="form-input w-full"
              value={form.businessPreset}
              onChange={(e) => updateForm('businessPreset', e.target.value as BusinessPreset)}
            >
              <option value="programs">{t('settings.onboarding.preset_programs')}</option>
              <option value="services">{t('settings.onboarding.preset_services')}</option>
              <option value="catalog">{t('settings.onboarding.preset_catalog')}</option>
            </select>
          </div>
        </section>
      )}

      {step === 'terminology' && (
        <section className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t('settings.onboarding.labels_intro')}</p>
            <p>{t('settings.onboarding.labels_how')}</p>
            <p>
              {t('settings.onboarding.labels_defaults', {
                preset: t(`settings.onboarding.preset_${form.businessPreset}`),
              })}
            </p>
          </div>
          <div className="hidden sm:grid sm:grid-cols-3 gap-2 text-xs font-medium text-muted-foreground px-0.5">
            <span>{t('settings.onboarding.labels_concept')}</span>
            <span>{t('settings.onboarding.labels_singular')}</span>
            <span>{t('settings.onboarding.labels_plural')}</span>
          </div>
          <div className="space-y-4">
            {ENTITY_KEYS.map((key) => (
              <div key={key} className="space-y-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:items-center">
                  <div>
                    <span className="text-sm font-medium">
                      {t(`settings.onboarding.entity_${key}`)}
                    </span>
                    <p className="text-xs text-muted-foreground sm:pr-2">
                      {t(`settings.onboarding.entity_${key}_desc`)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="sr-only sm:not-sr-only sm:hidden text-xs text-muted-foreground">
                      {t('settings.onboarding.labels_singular')}
                    </label>
                    <input
                      className="form-input w-full"
                      aria-label={t('settings.onboarding.labels_singular_for', {
                        entity: t(`settings.onboarding.entity_${key}`),
                      })}
                      placeholder={defaultLabels[key].singular}
                      value={form.labelOverrides[key]?.singular ?? ''}
                      onChange={(e) =>
                        updateForm('labelOverrides', {
                          ...form.labelOverrides,
                          [key]: {
                            singular: e.target.value,
                            plural: form.labelOverrides[key]?.plural ?? '',
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="sr-only sm:not-sr-only sm:hidden text-xs text-muted-foreground">
                      {t('settings.onboarding.labels_plural')}
                    </label>
                    <input
                      className="form-input w-full"
                      aria-label={t('settings.onboarding.labels_plural_for', {
                        entity: t(`settings.onboarding.entity_${key}`),
                      })}
                      placeholder={defaultLabels[key].plural}
                      value={form.labelOverrides[key]?.plural ?? ''}
                      onChange={(e) =>
                        updateForm('labelOverrides', {
                          ...form.labelOverrides,
                          [key]: {
                            singular: form.labelOverrides[key]?.singular ?? '',
                            plural: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
          <p className="text-sm text-muted-foreground">{t('settings.onboarding.tax_no_local_vat')}</p>
          <p className="text-sm text-muted-foreground">{t('settings.onboarding.tax_price_hint')}</p>
        </section>
      )}

      {step === 'integrations' && (
        <p className="text-sm text-muted-foreground">{t('settings.onboarding.integrations_skip')}</p>
      )}

      {step === 'starter' && (
        <p className="text-sm text-muted-foreground">{t('settings.onboarding.starter_seed')}</p>
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
              <dt className="text-muted-foreground">{t('settings.onboarding.business_preset')}</dt>
              <dd>{form.businessPreset}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="ob-admin-email">
              {t('settings.onboarding.admin_email')}
            </label>
            <input
              id="ob-admin-email"
              type="email"
              className="form-input w-full"
              value={form.adminEmail}
              onChange={(e) => updateForm('adminEmail', e.target.value)}
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
