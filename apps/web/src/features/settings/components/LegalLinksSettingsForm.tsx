import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

const FIELDS = [
  { key: 'privacy_policy_url', label: 'legal.settings_privacy_url' },
  { key: 'terms_url', label: 'legal.settings_terms_url' },
  { key: 'accessibility_statement_url', label: 'legal.settings_accessibility_url' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

/** Same rule as the tenants_legal_urls_https_check constraint. */
export function isValidLegalUrl(value: string): boolean {
  return value === '' || /^https:\/\/\S+$/.test(value);
}

/** Studio's own privacy policy, terms and accessibility statement links. */
export function LegalLinksSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    privacy_policy_url: '',
    terms_url: '',
    accessibility_statement_url: '',
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setValues({
      privacy_policy_url: tenant.privacy_policy_url ?? '',
      terms_url: tenant.terms_url ?? '',
      accessibility_statement_url: tenant.accessibility_statement_url ?? '',
    });
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const trimmed = Object.fromEntries(
        FIELDS.map(({ key }) => [key, values[key].trim()]),
      ) as Record<FieldKey, string>;
      if (!Object.values(trimmed).every(isValidLegalUrl)) {
        throw new Error(t('legal.settings_invalid_url'));
      }
      const { error } = await supabase
        .from('tenants')
        .update({
          privacy_policy_url: trimmed.privacy_policy_url || null,
          terms_url: trimmed.terms_url || null,
          accessibility_statement_url: trimmed.accessibility_statement_url || null,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('legal.settings_saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('legal.settings_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('legal.settings_description')}</p>
      {FIELDS.map(({ key, label }) => (
        <div className="space-y-2" key={key}>
          <label className="block text-sm font-medium" htmlFor={`legal-${key}`}>
            {t(label)}
          </label>
          <input
            id={`legal-${key}`}
            type="url"
            inputMode="url"
            dir="ltr"
            placeholder="https://"
            className="form-input w-full"
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </div>
      ))}
      {message && (
        <p className="text-sm" role="status" aria-live="polite">
          {message}
        </p>
      )}
      <Button
        variant="primary"
        disabled={saveMutation.isPending}
        onClick={() => void saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
