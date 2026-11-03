import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { buildLegalPack } from '@/legal/legalPack';
import { fetchTenantLegalProfile } from '@/legal/useLegalDocument';
import { legalFieldLabel, missingLegalDetails } from '@/legal/fields';
import { autofilledKeys, useLegalAutofill, withLegalAutofill } from '@/legal/autofill';
import { signedDocNoun } from '@/legal/packWording';
import {
  draftDocuments,
  fetchSignedFormsReview,
  packDocumentsFor,
  signedFormsReviewKey,
  useLawyerDocuments,
} from '@/legal/lawyerDocuments';
import { LawyerDocumentsList, packDocumentLabelKey } from './LawyerDocumentsList';

export interface LegalPackPanelProps {
  tenantId: string;
  /**
   * acknowledge: the studio's own admin (finish screen, Settings → Legal) ticks the box.
   * notice: the platform owner after setting a studio up; the studio's admin confirms later.
   */
  mode: 'acknowledge' | 'notice';
  /** Where the admin fills in missing legal details (omit where they can't yet, e.g. right after signup). */
  detailsHref?: string;
  /** End of onboarding: offer the lawyer-reviewed uploads in a collapsed section. */
  offerUploads?: boolean;
}

/** Path of the printable pack (any host: it loads the studio by id). */
export function legalPackPrintPath(tenantId: string): string {
  return `/legal-pack/print?tenant=${encodeURIComponent(tenantId)}`;
}

/**
 * The end of onboarding and Settings → Legal: the studio's documents are
 * drafts, here they are as one PDF for a lawyer, and the admin confirms they
 * understand before the studio's legal pages and signing go live.
 */
export function LegalPackPanel({ tenantId, mode, detailsHref, offerUploads }: LegalPackPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  const { data: legal } = useQuery({
    queryKey: ['tenant-legal-profile-by-id', tenantId],
    queryFn: () => fetchTenantLegalProfile(tenantId),
  });
  // Empty details filled from what the studio already gave us (saved on Confirm).
  const { autofill } = useLegalAutofill(legal);
  const profile = legal ? withLegalAutofill(legal.profile, autofill) : {};
  const { data: pack } = useQuery({
    queryKey: ['legal-pack', tenantId, legal?.updatedAt, legal?.vertical, JSON.stringify(profile)],
    enabled: !!legal,
    queryFn: () => buildLegalPack({ ...legal!, profile }),
  });

  const { data: uploads = [] } = useLawyerDocuments(legal ? tenantId : undefined);
  const { data: forms = null } = useQuery({
    queryKey: signedFormsReviewKey(tenantId),
    enabled: !!legal && mode === 'acknowledge',
    queryFn: () => fetchSignedFormsReview(tenantId),
  });
  // What the acknowledgement covers as drafts: everything not yet lawyer-reviewed.
  const drafts = legal ? draftDocuments(packDocumentsFor(legal.vertical), uploads, forms) : [];

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!pack || !legal) throw new Error('not ready');
      let confirmed = pack;
      // Store the details filled in for the studio, so the published documents carry them.
      if (autofilledKeys(legal.profile, autofill).length > 0) {
        const { error: saveError } = await supabase
          .from('tenants')
          .update({ legal_profile: withLegalAutofill(legal.profile, autofill) })
          .eq('id', tenantId);
        if (saveError) throw saveError;
        const fresh = await fetchTenantLegalProfile(tenantId);
        if (fresh) confirmed = await buildLegalPack(fresh);
      }
      // Older studios may predate the form seeded at creation: add it first (no-op otherwise).
      if (confirmed.signedForms.length > 0) {
        await supabase.functions.invoke('provision-studio', { body: { action: 'ensure_signed_template' } });
      }
      const { error } = await supabase.rpc('acknowledge_studio_legal_pack', {
        p_version: confirmed.version,
        p_language: i18n.language?.startsWith('he') ? 'he' : 'en',
        p_drafts: drafts,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile-by-id', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['lawyer-documents', tenantId] }),
      ]);
    },
  });

  const acknowledgedAt = legal?.packAcknowledgedAt ?? null;
  const lang = i18n.language?.startsWith('he') ? 'he' : 'en';
  // Confirming publishes the documents, so the details they are filled from must be there first.
  const missing = legal ? missingLegalDetails(legal.vertical, profile) : [];
  const doc = t(`legal.pack.doc.${signedDocNoun(legal?.vertical)}`);
  const dateFormat = new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', {
    dateStyle: 'medium',
  });

  return (
    <section aria-labelledby="legal-pack-title" className="space-y-3 rounded-lg border border-border p-4 text-start">
      <h2 id="legal-pack-title" className="text-lg font-semibold">{t('legal.pack.title')}</h2>
      <Alert variant="warning" role="note">
        <p className="text-sm">{t('legal.pack.notice', { doc })}</p>
      </Alert>

      <a
        href={legalPackPrintPath(tenantId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 outline-offset-2"
      >
        {t('legal.pack.download')}
      </a>

      {mode === 'notice' && !acknowledgedAt && (
        <p className="text-sm text-gray-700">{t('legal.pack.owner_confirms', { doc })}</p>
      )}

      {acknowledgedAt ? (
        <p className="text-sm" role="status">
          {t('legal.pack.confirmed_on', { date: dateFormat.format(new Date(acknowledgedAt)), doc })}
        </p>
      ) : (
        mode === 'acknowledge' && (
          <div className="space-y-3">
            {missing.length > 0 && (
              <div className="text-sm" role="status">
                <p className="font-medium text-amber-800">
                  {t('legal.pack.details_missing', { count: missing.length })}
                </p>
                <p className="text-muted-foreground">{missing.map((f) => legalFieldLabel(f, profile, lang)).join(' · ')}</p>
                {detailsHref ? (
                  <a href={detailsHref} className="font-medium underline">
                    {t('legal.pack.details_missing_link')}
                  </a>
                ) : (
                  <p>{t('legal.pack.details_missing_later')}</p>
                )}
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                {drafts.length > 0
                  ? t('legal.pack.checkbox_drafts', {
                      list: drafts.map((d) => t(packDocumentLabelKey(d, legal?.vertical))).join(', '),
                    })
                  : t('legal.pack.checkbox_all_reviewed')}
              </span>
            </label>
            {acknowledge.isError && (
              <p className="text-sm text-red-700" role="alert">
                {/signed_template_missing/.test(acknowledge.error?.message ?? '')
                  ? t('legal.pack.error_form_missing', { doc })
                  : t('legal.pack.error')}
              </p>
            )}
            <Button
              variant="primary"
              disabled={!checked || !pack || missing.length > 0 || acknowledge.isPending}
              onClick={() => acknowledge.mutate()}
            >
              {acknowledge.isPending ? t('legal.pack.confirming') : t('legal.pack.confirm')}
            </Button>
          </div>
        )
      )}

      {offerUploads && legal && mode === 'acknowledge' && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">{t('legal.lawyer.upload_now')}</summary>
          <div className="mt-3">
            <LawyerDocumentsList legal={legal} />
          </div>
        </details>
      )}
    </section>
  );
}
