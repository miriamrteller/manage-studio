import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { EXISTING_STUDIO_PROFILE, type StudioProfile } from '@shared/index';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { profileOf, workModesOf, type WorkModes } from '../lib/workModes';

/** Active enrolments, so switching classes off can say they keep running. Never blocks. */
async function countActiveEnrolments(): Promise<number> {
  const { count, error } = await supabase
    .from('engagements')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  if (error) return 0;
  return count ?? 0;
}

/**
 * Settings: "Your business". How clients pay and which areas the studio uses. These only decide
 * what is shown and what is on by default: switching an area off hides it, never deletes data,
 * never stops billing, and is never refused.
 */
export function BusinessSettings() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  // A tenant payload without a profile (an older cached one) reads as an existing studio.
  const saved = tenant ? (tenant.profile ?? EXISTING_STUDIO_PROFILE) : undefined;
  const [draft, setDraft] = useState<StudioProfile | null>(saved ?? null);
  const [notice, setNotice] = useState<number | null>(null);
  // "Clients sign a health declaration": the studio's setting, or its field's default until it sets one.
  const { data: legal } = useTenantLegalProfile();
  const savedHealth = legal?.healthDeclarations;
  const [health, setHealth] = useState<boolean | undefined>(savedHealth);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);
  useEffect(() => {
    if (savedHealth !== undefined) setHealth(savedHealth);
  }, [savedHealth]);

  const save = useMutation({
    mutationFn: async (profile: StudioProfile) => {
      const { error } = await supabase.rpc('set_business_profile', {
        p_tenant_id: tenant!.id,
        p_payment_flow: profile.paymentFlow,
        p_teaches_classes: profile.teachesClasses,
        p_family_accounts: profile.familyAccounts,
        p_client_booking: profile.clientBooking,
        // Sent only when changed, so a studio that never chose keeps following its field.
        ...(health !== undefined && health !== savedHealth ? { p_health_declaration: health } : {}),
      });
      if (error) throw error;
      // Informational only: running enrolments keep running when classes are hidden.
      const switchedClassesOff = Boolean(saved?.teachesClasses) && !profile.teachesClasses;
      setNotice(switchedClassesOff ? await countActiveEnrolments() : null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant'] });
      void queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] });
    },
  });

  if (!tenant || !draft) return null;
  const sameProfile =
    !!saved &&
    draft.paymentFlow === saved.paymentFlow &&
    draft.teachesClasses === saved.teachesClasses &&
    draft.familyAccounts === saved.familyAccounts &&
    draft.clientBooking === saved.clientBooking;
  const dirty = !sameProfile || health !== savedHealth;

  const modes = workModesOf(draft);
  const setMode = (patch: Partial<WorkModes>) => setDraft(profileOf({ ...modes, ...patch }));

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <header className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">{t('settings.business.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.business.intro')}</p>
      </header>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('settings.business.work_legend')}</legend>
        <p className="text-xs text-muted-foreground">{t('settings.business.work_hint')}</p>
        {(['classes', 'projects', 'appointments'] as const).map((mode) => (
          <div key={mode} className="text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={modes[mode]}
                onChange={(e) => setMode({ [mode]: e.target.checked })}
                aria-describedby={`${id}-${mode}-hint`}
              />
              <span className="font-medium">{t(`settings.business.work_${mode}_label`)}</span>
            </label>
            <p id={`${id}-${mode}-hint`} className="ms-6 text-xs text-muted-foreground">
              {t(`settings.business.work_${mode}_hint`)}
            </p>
            {mode === 'classes' && modes.classes && (
              <div className="ms-6 mt-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={modes.families}
                    onChange={(e) => setMode({ families: e.target.checked })}
                    aria-describedby={`${id}-families-hint`}
                  />
                  <span>{t('settings.business.families_label')}</span>
                </label>
                <p id={`${id}-families-hint`} className="ms-6 text-xs text-muted-foreground">
                  {t('settings.business.families_hint')}
                </p>
              </div>
            )}
          </div>
        ))}
      </fieldset>

      {health !== undefined && (
        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t('studio_setup.filled_for_you')}</summary>
          <div className="mt-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={health}
                onChange={(e) => setHealth(e.target.checked)}
                aria-describedby={`${id}-health-hint`}
              />
              <span>{t('settings.business.health_label')}</span>
            </label>
            <p id={`${id}-health-hint`} className="ms-6 text-xs text-muted-foreground">
              {t('settings.business.health_hint')}
            </p>
          </div>
        </details>
      )}

      {notice !== null && notice > 0 && (
        <div role="status" className="flex items-start justify-between gap-3 rounded border border-gray-200 p-3 text-sm">
          <p>{t('settings.business.classes_off_notice', { count: notice })}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setNotice(null)}>
            {t('settings.business.dismiss')}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {t('settings.business.save')}
        </Button>
        {save.isSuccess && !dirty && <span role="status" className="text-sm">{t('settings.business.saved')}</span>}
        {save.isError && <span role="alert" className="text-sm text-destructive">{t('settings.business.error')}</span>}
      </div>
    </section>
  );
}
