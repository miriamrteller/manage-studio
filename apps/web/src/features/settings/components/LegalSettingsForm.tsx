import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { LegalLinksSettingsForm } from './LegalLinksSettingsForm';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import { LawyerDocumentsList } from '@/components/legal/LawyerDocumentsList';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  fieldsForVertical,
  missingLegalDetails,
  type LegalDocId,
  type LegalFieldDef,
  type LegalFieldSection,
} from '@/legal/fields';
import { prepareLegalMarkdown } from '@/legal/render';
import { HIDDEN_LEGAL_KEYS, useLegalAutofill, withLegalAutofill } from '@/legal/autofill';
import { loadLegalTemplate } from '@/legal/templates';
import {
  tenantHasEnrolmentTerms,
  useLegalLang,
  useTenantLegalProfile,
} from '@/legal/useLegalDocument';

const SECTION_ORDER: LegalFieldSection[] = ['identity', 'contacts', 'enrolment', 'photography', 'retention'];

/**
 * Settings → Legal: the studio's legal details. They fill the studio's
 * privacy policy, enrolment terms and accessibility statement (/legal/…).
 * The privacy policy and terms go live only after an admin publishes them.
 */
export function LegalSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const lang = useLegalLang();
  const queryClient = useQueryClient();
  const { data: legal } = useTenantLegalProfile();
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  // Details the studio already gave us (name, contact email, providers, season).
  const { autofill } = useLegalAutofill(legal);
  const autofillKey = JSON.stringify(autofill);

  useEffect(() => {
    if (!legal) return;
    // Stored details, with empty ones filled from what we know; keep what the admin is typing.
    setValues((prev) => {
      const next = withLegalAutofill(legal.profile, autofill);
      touched.forEach((k) => {
        next[k] = prev[k] ?? '';
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autofillKey stands for autofill; touched is read, not tracked
  }, [legal, autofillKey]);

  const vertical = legal?.vertical ?? 'generic';
  const fields = useMemo(() => fieldsForVertical(vertical), [vertical]);
  // Shown fields: the providers and business email come from the studio's setup.
  const visibleFields = useMemo(
    () => fields.filter((f) => !(HIDDEN_LEGAL_KEYS as readonly string[]).includes(f.key)),
    [fields],
  );
  const publishDocs: LegalDocId[] = tenantHasEnrolmentTerms(vertical)
    ? ['studio-privacy', 'enrolment-terms']
    : ['studio-privacy'];

  // What is still missing, checked against the real templates in both languages.
  const { data: missing } = useQuery({
    queryKey: ['legal-missing', legal?.tenantId, JSON.stringify(values), vertical],
    enabled: !!legal,
    queryFn: async () => {
      const keys = new Set<string>();
      for (const doc of publishDocs) {
        for (const l of ['he', 'en'] as const) {
          const raw = await loadLegalTemplate(doc, l);
          const out = prepareLegalMarkdown(raw, {
            doc,
            lang: l,
            vertical,
            tenantName: legal!.name,
            contactEmail: legal!.contactEmail,
            profile: values,
            updatedAt: legal!.updatedAt,
          });
          out.missing.forEach((k) => keys.add(k));
        }
      }
      // The same required-details list the legal pack's Confirm uses.
      missingLegalDetails(vertical, values, 'publish').forEach((f) => keys.add(f.key));
      return [...keys];
    },
  });


  const save = useMutation({
    mutationFn: async (opts: { publish?: boolean }) => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const clean: Record<string, string> = {};
      for (const f of fields) {
        const v = (values[f.key] ?? '').trim();
        if (v) clean[f.key] = v.slice(0, 2000);
      }
      const update: Record<string, unknown> = { legal_profile: clean };
      if (opts.publish !== undefined) update.legal_pages_published = opts.publish;
      const { error } = await supabase.from('tenants').update(update).eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async (_d, opts) => {
      setMessage(
        opts.publish === true
          ? t('legal.settings.published')
          : opts.publish === false
            ? t('legal.settings.unpublished')
            : t('legal.settings.saved'),
      );
      await queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile-by-id'] });
      await queryClient.invalidateQueries({ queryKey: ['legal-doc'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant || !legal) return null;

  const missingLabels = (missing ?? []).map((key) => {
    if (key === 'receipts') return t('legal.settings.missing_receipts');
    const f = fields.find((x) => x.key === key);
    return f ? f.label[lang] : key;
  });
  const canPublish = (missing ?? ['?']).length === 0;
  const requiredFields = visibleFields.filter((f) => f.required && !f.defaultValue);
  const requiredDone = requiredFields.filter((f) => (values[f.key] ?? '').trim()).length;

  const renderField = (f: LegalFieldDef) => {
    const id = `legal-${f.key}`;
    const value = values[f.key] ?? '';
    const onChange = (v: string) => {
      setTouched((prev) => new Set(prev).add(f.key));
      setValues((prev) => ({ ...prev, [f.key]: v }));
    };
    const placeholder = f.defaultValue?.[lang];
    const fromStudio = !!value && value === autofill[f.key] && !(legal.profile[f.key] ?? '').trim();
    return (
      <div key={f.key} className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {f.label[lang]}
          {f.required && <span aria-hidden="true"> *</span>}
        </label>
        {f.kind === 'select' ? (
          <select id={id} className="form-input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{t('legal.settings.choose')}</option>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label[lang]}
              </option>
            ))}
          </select>
        ) : f.kind === 'textarea' ? (
          <textarea
            id={id}
            className="form-input w-full"
            rows={3}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            type={f.kind === 'number' ? 'number' : f.kind}
            dir={f.kind === 'tel' || f.kind === 'email' ? 'ltr' : undefined}
            className="form-input w-full"
            value={value}
            placeholder={placeholder}
            required={f.required}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {fromStudio && <p className="text-xs text-muted-foreground">{t('legal.settings.filled_from_studio')}</p>}
        {f.hint && <p className="text-xs text-muted-foreground">{f.hint[lang]}</p>}
        {f.example && !value && (
          <p className="text-xs text-muted-foreground">{t('legal.settings.example', { example: f.example[lang] })}</p>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('legal.settings.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('legal.settings.description')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('legal.settings.language_note')}</p>
      </div>

      {/* How far along the required details are (they fill every document). */}
      <p className="text-sm font-medium" role="status" aria-live="polite">
        {t('legal.settings.required_progress', { done: requiredDone, total: requiredFields.length })}
      </p>

      {SECTION_ORDER.map((section) => {
        const sectionFields = visibleFields.filter((f) => f.section === section);
        if (sectionFields.length === 0) return null;
        return (
          <fieldset
            key={section}
            id={section === 'identity' ? 'legal-details' : undefined}
            className="space-y-3 border rounded-md p-4"
          >
            <legend className="px-1 font-medium">{t(`legal.settings.sections.${section}`)}</legend>
            <p className="text-xs text-muted-foreground">{t(`legal.settings.why.${section}`)}</p>
            {sectionFields.map(renderField)}
          </fieldset>
        );
      })}

      <div className="rounded-md border p-4 space-y-3">
        <h3 className="font-medium">{t('legal.settings.pages_title')}</h3>
        <ul className="text-sm list-disc ps-6 space-y-1">
          <li>
            <Link className="underline" to="/legal/studio-privacy" target="_blank" rel="noopener noreferrer">
              {t('legal.docs.studio_privacy')}
            </Link>
          </li>
          {tenantHasEnrolmentTerms(vertical) && (
            <li>
              <Link className="underline" to="/legal/enrolment-terms" target="_blank" rel="noopener noreferrer">
                {t('legal.docs.enrolment_terms')}
              </Link>
            </li>
          )}
          <li>
            <Link className="underline" to="/legal/accessibility" target="_blank" rel="noopener noreferrer">
              {t('legal.docs.accessibility')}
            </Link>
          </li>
        </ul>
        {missingLabels.length > 0 ? (
          <div className="text-sm" role="status">
            <p className="font-medium">{t('legal.settings.missing_title')}</p>
            <ul className="list-disc ps-6">
              {missingLabels.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm" role="status">
            {t('legal.settings.complete')}
          </p>
        )}
        <p className="text-sm">
          {legal.published ? t('legal.settings.status_published') : t('legal.settings.status_draft')}
        </p>
        <p className="text-xs text-muted-foreground">{t('legal.settings.review_note')}</p>
      </div>

      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate({})}>
          {t('common.save')}
        </Button>
        {legal.published ? (
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ publish: false })}>
            {t('legal.settings.unpublish')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={save.isPending || !canPublish}
            onClick={() => save.mutate({ publish: true })}
          >
            {t('legal.settings.publish')}
          </Button>
        )}
      </div>

      {/* The lawyer-reviewed versions, then the acknowledgement: after the details it depends on. */}
      <section aria-labelledby="lawyer-documents-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="lawyer-documents-title" className="font-medium">{t('legal.lawyer.title')}</h3>
        <LawyerDocumentsList legal={legal} />
      </section>

      <LegalPackPanel tenantId={legal.tenantId} mode="acknowledge" detailsHref="#legal-details" />

      <hr className="border-gray-200" />
      <p className="text-sm text-muted-foreground">{t('legal.settings.own_pages_note')}</p>
      <LegalLinksSettingsForm />
    </section>
  );
}
