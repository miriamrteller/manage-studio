import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { SignerDetailsSnapshot } from '@shared/signerDetails';

interface SignedDetailsDialogProps {
  evidenceId: string | null;
  signerName: string;
  onClose: () => void;
}

/**
 * The full signer details sealed with a signed form, including the ID number. Only this dialog
 * shows the full number (lists show it masked), and opening it is written to the audit log.
 */
export function SignedDetailsDialog({ evidenceId, signerName, onClose }: SignedDetailsDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!evidenceId) return;
    // Best effort, never blocks (audit_log, Data Security Regulations reg. 10).
    void supabase
      .rpc('log_sensitive_read', { p_entity_type: 'waiver_evidence', p_entity_id: evidenceId })
      .then(({ error }) => {
        if (error) console.warn('[SignedDetailsDialog] view not logged', error.message);
      });
  }, [evidenceId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['signed-record-details', evidenceId],
    enabled: Boolean(evidenceId),
    // Sensitive: never keep it around once the dialog is closed.
    gcTime: 0,
    queryFn: async () => {
      const { data: details, error: rpcError } = await supabase.rpc('get_signed_record_details', {
        p_evidence_id: evidenceId as string,
      });
      if (rpcError) throw rpcError;
      return (details as SignerDetailsSnapshot | null) ?? null;
    },
  });

  if (!evidenceId) return null;

  const rows: Array<[string, string | undefined]> = data
    ? [
        [t('pages.waivers.details_name'), data.signer.full_name],
        [
          data.signer.id_type === 'passport' ? t('pages.waivers.details_passport') : t('pages.waivers.details_id'),
          data.signer.id_number,
        ],
        ...(data.signer.id_type === 'passport'
          ? ([[t('pages.waivers.details_passport_country'), data.signer.passport_country]] as Array<[string, string | undefined]>)
          : []),
        [t('pages.waivers.details_phone'), data.signer.phone],
        [t('pages.waivers.details_address'), data.signer.address],
        ...(data.child
          ? ([
              [t('pages.waivers.details_child_name'), data.child.full_name],
              [t('pages.waivers.details_child_dob'), data.child.date_of_birth],
            ] as Array<[string, string | undefined]>)
          : []),
        [t('pages.waivers.details_confirmed'), data.confirmed_wording],
      ]
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pages.waivers.details_title')}</DialogTitle>
          <DialogDescription>{signerName}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">{t('errors.server_error')}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">{t('pages.waivers.details_none')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="font-medium text-muted-foreground">{label}</dt>
                  <dd className="break-words" dir="auto">{value}</dd>
                </div>
              ))}
            </dl>
            {data.child?.dob_differs_from_profile && (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="note">
                {t('pages.waivers.details_dob_differs')}
              </p>
            )}
          </>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
