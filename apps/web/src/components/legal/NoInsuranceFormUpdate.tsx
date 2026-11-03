import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useTenant } from '@/hooks/useTenant';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { useWaiverTemplates } from '@/features/waivers/hooks/useWaiverTemplates';
import { WaiverService } from '@/features/waivers/service';
import { formsMissingNoInsuranceNote, withNoInsuranceNote } from '@/legal/noInsuranceForm';
import { hasHealthDeclarations, insuranceStatus } from '@shared/legal/signed-template';

async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Studios with no insurance whose active health declaration predates the
 * no-insurance sentence: one click adds it as a new version and makes it
 * active. Parents then sign the new version, so the studio chooses when.
 * Never shown otherwise, never required.
 */
export function NoInsuranceFormUpdate() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { data: legal } = useTenantLegalProfile();
  const { templates } = useWaiverTemplates();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const forms = formsMissingNoInsuranceNote(templates);

  const update = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error('Tenant not initialized');
      for (const form of forms) {
        const content = withNoInsuranceNote(form);
        if (!content) continue;
        const draft = await WaiverService.createDraft(tenant, {
          name: form.name,
          content,
          version_hash: await sha256Hex(content),
        });
        await WaiverService.activateTemplate(tenant, draft.id);
      }
    },
    onSuccess: async () => {
      setConfirming(false);
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ['waiver-templates', tenant?.id] });
    },
  });

  if (done) {
    return (
      <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        {t('legal.no_insurance_form_update.done')}
      </p>
    );
  }
  if (!tenant || !legal || legal.tenantId !== tenant.id) return null;
  if (!hasHealthDeclarations(legal.vertical) || insuranceStatus(legal.profile) !== 'none' || forms.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>{t('legal.no_insurance_form_update.intro', { count: forms.length })}</p>
      <Button variant="outline" onClick={() => setConfirming(true)}>
        {t('legal.no_insurance_form_update.action', { count: forms.length })}
      </Button>
      <Modal
        isOpen={confirming}
        onClose={() => !update.isPending && setConfirming(false)}
        title={t('legal.no_insurance_form_update.confirm_title')}
        describedById="no-insurance-form-update-body"
      >
        <div className="space-y-4">
          <p id="no-insurance-form-update-body" className="text-sm text-gray-700">
            {t('legal.no_insurance_form_update.confirm_body')}
          </p>
          <ul className="list-disc ps-5 text-sm text-gray-700">
            {forms.map((f) => (
              <li key={f.id}>{f.name}</li>
            ))}
          </ul>
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('legal.no_insurance_form_update.failed')}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)} disabled={update.isPending}>
              {t('legal.no_insurance_form_update.later')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => update.mutate()} disabled={update.isPending}>
              {t('legal.no_insurance_form_update.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
