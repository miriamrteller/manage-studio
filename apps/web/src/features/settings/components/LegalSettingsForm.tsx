import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { LegalLinksSettingsForm } from './LegalLinksSettingsForm';
import { NoInsuranceFormUpdate } from '@/components/legal/NoInsuranceFormUpdate';
import { LegalPackPanel } from '@/components/legal/LegalPackPanel';
import { LawyerDocumentsList, packDocumentLabelKey } from '@/components/legal/LawyerDocumentsList';
import { pdfsAffectedByChange, useLawyerDocuments, type UploadableDoc } from '@/legal/lawyerDocuments';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import {
  fieldsForVertical,
  LEGAL_FIELDS,
  legalFieldLabel,
  missingLegalDetails,
  type LegalDocId,
  type LegalFieldDef,
  type LegalFieldSection,
} from '@/legal/fields';
import { prepareLegalMarkdown } from '@/legal/render';
import { STUDIO_LEGAL_KEYS, useLegalAutofill, withLegalAutofill } from '@/legal/autofill';
import { isValidIsraeliId } from '@shared/legal/personalIdentity';
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
  // Details the studio already gave us (name, contact email, providers, the
  // owner's phone and the classes' shared address), each shown and editable here.
  const { autofill } = useLegalAutofill(legal, { studioSuggestions: true });
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
  const teachesClasses = legal?.teachesClasses !== false;
  const fields = useMemo(() => fieldsForVertical(vertical, teachesClasses), [vertical, teachesClasses]);
  // Shown: what only the studio can tell us, and anything required that is still
  // empty. The rest (filled from the studio's setup, or with a sensible default)
  // waits under "Details we filled in for you".
  const shownKeys = useMemo(() => {
    const known = withLegalAutofill(legal?.profile, autofill);
    return new Set(
      fields
        .filter(
          (f) =>
            (STUDIO_LEGAL_KEYS as readonly string[]).includes(f.key) ||
            (f.required && !f.defaultValue && !(known[f.key] ?? '').trim()),
        )
        .map((f) => f.key),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autofillKey stands for autofill
  }, [fields, legal, autofillKey]);
  // Not yet registered: the person's own name and ID are asked for (never filled in for them).
  const personal = values.business_status === 'not_registered';
  const visible = (f: LegalFieldDef) => !f.showWhen || f.showWhen(values);
  const isShown = (f: LegalFieldDef) =>
    shownKeys.has(f.key) || (personal && ['legal_name', 'personal_id', 'no_israeli_id', 'passport_number', 'passport_country'].includes(f.key));
  const shownFields = fields.filter((f) => visible(f) && isShown(f));
  const filledFields = fields.filter((f) => visible(f) && !isShown(f));
  const publishDocs: LegalDocId[] = tenantHasEnrolmentTerms(vertical, teachesClasses)
    ? ['studio-privacy', 'enrolment-terms']
    : ['studio-privacy'];

  // What is still missing, checked against the real templates in both languages.
  const { data: missing } = useQuery({
    queryKey: ['legal-missing', legal?.tenantId, JSON.stringify(values), vertical, teachesClasses],
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
            teachesClasses,
          });
          out.missing.forEach((k) => keys.add(k));
        }
      }
      // The same required-details list the legal pack's Confirm uses.
      missingLegalDetails(vertical, values, 'publish', legal!.name, teachesClasses).forEach((f) => keys.add(f.key));
      return [...keys];
    },
  });


  const { data: lawyerUploads } = useLawyerDocuments(legal?.tenantId);
  const hasLawyerPdf = (lawyerUploads ?? []).some((u) => u.kind === 'pdf');
  const [pdfsToUpdate, setPdfsToUpdate] = useState<UploadableDoc[]>([]);

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
      // Lawyer-reviewed PDFs don't update with the details: say which ones to replace.
      const before = legal?.profile ?? {};
      const changed = fields.map((f) => f.key).filter((k) => (before[k] ?? '').trim() !== (values[k] ?? '').trim());
      setPdfsToUpdate(
        pdfsAffectedByChange(
          lawyerUploads ?? [],
          changed,
          Object.fromEntries(LEGAL_FIELDS.map((f) => [f.key, f.placeholders])),
        ),
      );
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
    return f ? legalFieldLabel(f, values, lang) : key;
  });
  const canPublish = (missing ?? ['?']).length === 0;
  const requiredFields = fields.filter((f) => f.required && !f.defaultValue);
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
    const label = legalFieldLabel(f, values, lang);
    const invalidId = f.key === 'personal_id' && !!value.trim() && !isValidIsraeliId(value);
    if (f.kind === 'checkbox') {
      return (
        <div key={f.key} className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={value === 'yes'}
            onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
          />
          <label htmlFor={id} className="text-sm">
            {label}
          </label>
        </div>
      );
    }
    return (
      <div key={f.key} className="space-y-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
          {(f.required || (personal && ['personal_id', 'passport_number', 'passport_country'].includes(f.key))) && (
            <span aria-hidden="true"> *</span>
          )}
        </label>
        {f.kind === 'select' ? (
          <select
            id={id}
            className="form-input w-full"
            // An unanswered choice shows (and means) its default, never the first option.
            value={value || f.defaultValue?.[lang] || ''}
            onChange={(e) => onChange(e.target.value)}
          >
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
            aria-invalid={invalidId || undefined}
            aria-describedby={invalidId ? `${id}-error` : undefined}
            inputMode={f.key === 'personal_id' ? 'numeric' : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {invalidId && (
          <p id={`${id}-error`} className="text-xs text-red-700">
            {t('legal.settings.invalid_israeli_id')}
          </p>
        )}
        {f.key === 'insurance_status' && value !== 'insured' && (
          // Informational only: "no insurance" never blocks Confirm or Publish.
          <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {t('legal.settings.no_insurance_notice')}
          </p>
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

      {hasLawyerPdf && <p className="text-xs text-muted-foreground">{t('legal.lawyer.pdf_fields_hint')}</p>}

      {/* How far along the required details are (they fill every document). */}
      <p className="text-sm font-medium" role="status" aria-live="polite">
        {t('legal.settings.required_progress', { done: requiredDone, total: requiredFields.length })}
      </p>

      {SECTION_ORDER.map((section) => {
        const sectionFields = shownFields.filter((f) => f.section === section);
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

      {filledFields.length > 0 && (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer font-medium">
            {t('legal.settings.filled_for_you', { count: filledFields.length })}
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">{t('legal.settings.filled_for_you_hint')}</p>
          <div className="mt-3 space-y-3">{filledFields.map(renderField)}</div>
        </details>
      )}

      <div className="rounded-md border p-4 space-y-3">
        <h3 className="font-medium">{t('legal.settings.pages_title')}</h3>
        <ul className="text-sm list-disc ps-6 space-y-1">
          <li>
            <Link className="underline" to="/legal/studio-privacy" target="_blank" rel="noopener noreferrer">
              {t('legal.docs.studio_privacy')}
            </Link>
          </li>
          {tenantHasEnrolmentTerms(vertical, teachesClasses) && (
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

      {pdfsToUpdate.length > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {t('legal.lawyer.pdf_not_updated', {
              docs: pdfsToUpdate.map((d) => t(packDocumentLabelKey(d, legal.vertical))).join(', '),
            })}
          </p>
          <a href="#lawyer-documents" className="font-medium underline">
            {t('legal.lawyer.pdf_not_updated_link')}
          </a>
        </div>
      )}

      {/* The lawyer-reviewed versions, then the acknowledgement: after the details it depends on. */}
      <section id="lawyer-documents" aria-labelledby="lawyer-documents-title" className="space-y-3 rounded-lg border border-border p-4">
        <h3 id="lawyer-documents-title" className="font-medium">{t('legal.lawyer.title')}</h3>
        <LawyerDocumentsList legal={legal} />
      </section>

      <NoInsuranceFormUpdate />
      <LegalPackPanel tenantId={legal.tenantId} mode="acknowledge" detailsHref="#legal-details" />

      <hr className="border-gray-200" />
      <p className="text-sm text-muted-foreground">{t('legal.settings.own_pages_note')}</p>
      <LegalLinksSettingsForm />
    </section>
  );
}
