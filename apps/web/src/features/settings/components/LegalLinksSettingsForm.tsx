import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

const HttpsUrl = z.string().trim().url().refine((v) => v.startsWith('https://'), { message: 'https_required' });

export const LegalLinksSchema = z.object({
  privacy_policy_url: z.union([z.literal(''), HttpsUrl]),
  terms_url: z.union([z.literal(''), HttpsUrl]),
  accessibility_url: z.union([z.literal(''), HttpsUrl]),
  enrolment_terms_version: z.string().trim().min(1).max(40),
});

type Field = 'privacy_policy_url' | 'terms_url' | 'accessibility_url';
const FIELDS: Field[] = ['privacy_policy_url', 'terms_url', 'accessibility_url'];

/**
 * Admin → Setup → Settings → Legal pages: the studio's privacy policy, enrolment terms and
 * accessibility statement URLs (footer + privacy notices + terms checkbox) and the terms version.
 */
export function LegalLinksSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [values, setValues] = useState<Record<Field, string>>({
    privacy_policy_url: '',
    terms_url: '',
    accessibility_url: '',
  });
  const [version, setVersion] = useState('1');
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const savedPrivacy = tenant?.privacy_policy_url ?? '';
  const savedTerms = tenant?.terms_url ?? '';
  const savedAccessibility = tenant?.accessibility_url ?? '';
  const savedVersion = tenant?.enrolment_terms_version ?? '1';

  // Depend on the saved values, not the tenant object, so a re-fetched tenant object
  // with the same values does not reset what the admin is typing.
  useEffect(() => {
    setValues({
      privacy_policy_url: savedPrivacy,
      terms_url: savedTerms,
      accessibility_url: savedAccessibility,
    });
    setVersion(savedVersion);
  }, [savedPrivacy, savedTerms, savedAccessibility, savedVersion]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const parsed = LegalLinksSchema.safeParse({ ...values, enrolment_terms_version: version });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(
          issue?.message === 'https_required'
            ? t('settings.legal.https_required')
            : t('settings.legal.invalid_url'),
        );
      }
      const { error } = await supabase
        .from('tenants')
        .update({
          privacy_policy_url: parsed.data.privacy_policy_url || null,
          terms_url: parsed.data.terms_url || null,
          accessibility_url: parsed.data.accessibility_url || null,
          enrolment_terms_version: parsed.data.enrolment_terms_version,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setFieldError(null);
      setMessage(t('settings.legal.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => {
      setMessage(null);
      setFieldError(err.message);
    },
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="legal-links-title">
      <h2 id="legal-links-title" className="text-lg font-semibold text-foreground">
        {t('settings.legal.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.legal.description')}</p>

      {FIELDS.map((field) => (
        <div key={field} className="space-y-1">
          <label className="block text-sm font-medium" htmlFor={`legal-${field}`}>
            {t(`settings.legal.${field}`)}
          </label>
          <input
            id={`legal-${field}`}
            type="url"
            inputMode="url"
            dir="ltr"
            className="form-input w-full"
            placeholder="https://"
            value={values[field]}
            onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
          />
        </div>
      ))}

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="legal-terms-version">
          {t('settings.legal.terms_version')}
        </label>
        <input
          id="legal-terms-version"
          type="text"
          className="form-input w-full"
          maxLength={40}
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          aria-describedby="legal-terms-version-hint"
        />
        <p id="legal-terms-version-hint" className="text-xs text-muted-foreground">
          {t('settings.legal.terms_version_hint')}
        </p>
      </div>

      {fieldError && (
        <p className="text-sm text-destructive" role="alert">
          {fieldError}
        </p>
      )}
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        disabled={saveMutation.isPending}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
