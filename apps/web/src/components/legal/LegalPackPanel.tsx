import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { buildLegalPack } from '@/legal/legalPack';
import { fetchTenantLegalProfile } from '@/legal/useLegalDocument';

export interface LegalPackPanelProps {
  tenantId: string;
  /**
   * acknowledge: the studio's own admin (finish screen, Settings → Legal) ticks the box.
   * notice: the platform owner after setting a studio up; the studio's admin confirms later.
   */
  mode: 'acknowledge' | 'notice';
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
export function LegalPackPanel({ tenantId, mode }: LegalPackPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  const { data: legal } = useQuery({
    queryKey: ['tenant-legal-profile-by-id', tenantId],
    queryFn: () => fetchTenantLegalProfile(tenantId),
  });
  const { data: pack } = useQuery({
    queryKey: ['legal-pack', tenantId, legal?.updatedAt, legal?.vertical],
    enabled: !!legal,
    queryFn: () => buildLegalPack(legal!),
  });

  const acknowledge = useMutation({
    mutationFn: async () => {
      if (!pack) throw new Error('not ready');
      // Older studios may predate the form seeded at creation: add it first (no-op otherwise).
      if (pack.signedTemplate) {
        await supabase.functions.invoke('provision-studio', { body: { action: 'ensure_signed_template' } });
      }
      const { error } = await supabase.rpc('acknowledge_studio_legal_pack', {
        p_version: pack.version,
        p_language: i18n.language?.startsWith('he') ? 'he' : 'en',
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile-by-id', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] }),
      ]);
    },
  });

  const acknowledgedAt = legal?.packAcknowledgedAt ?? null;
  const dateFormat = new Intl.DateTimeFormat(i18n.language?.startsWith('he') ? 'he-IL' : 'en-GB', {
    dateStyle: 'medium',
  });

  return (
    <section aria-labelledby="legal-pack-title" className="space-y-3 rounded-lg border border-border p-4 text-start">
      <h2 id="legal-pack-title" className="text-lg font-semibold">{t('legal.pack.title')}</h2>
      <Alert variant="warning" role="note">
        <p className="text-sm">{t('legal.pack.notice')}</p>
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
        <p className="text-sm text-gray-700">{t('legal.pack.owner_confirms')}</p>
      )}

      {acknowledgedAt ? (
        <p className="text-sm" role="status">
          {t('legal.pack.confirmed_on', { date: dateFormat.format(new Date(acknowledgedAt)) })}
        </p>
      ) : (
        mode === 'acknowledge' && (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>{t('legal.pack.checkbox')}</span>
            </label>
            {acknowledge.isError && (
              <p className="text-sm text-red-700" role="alert">
                {/signed_template_missing/.test(acknowledge.error?.message ?? '')
                  ? t('legal.pack.error_form_missing')
                  : t('legal.pack.error')}
              </p>
            )}
            <Button
              variant="primary"
              disabled={!checked || !pack || acknowledge.isPending}
              onClick={() => acknowledge.mutate()}
            >
              {acknowledge.isPending ? t('legal.pack.confirming') : t('legal.pack.confirm')}
            </Button>
          </div>
        )
      )}
    </section>
  );
}
