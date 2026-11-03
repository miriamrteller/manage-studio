import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { PaymentFlow, StudioProfile } from '@shared/index';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import queryClient from '@/lib/query-client';

const FLOWS: PaymentFlow[] = ['recurring', 'project', 'both'];

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
  const saved = tenant?.profile;
  const [draft, setDraft] = useState<StudioProfile | null>(saved ?? null);
  const [notice, setNotice] = useState<number | null>(null);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const save = useMutation({
    mutationFn: async (profile: StudioProfile) => {
      const { error } = await supabase.rpc('set_business_profile', {
        p_tenant_id: tenant!.id,
        p_payment_flow: profile.paymentFlow,
        p_teaches_classes: profile.teachesClasses,
        p_family_accounts: profile.familyAccounts,
        p_client_booking: profile.clientBooking,
      });
      if (error) throw error;
      // Informational only: running enrolments keep running when classes are hidden.
      const switchedClassesOff = Boolean(saved?.teachesClasses) && !profile.teachesClasses;
      setNotice(switchedClassesOff ? await countActiveEnrolments() : null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant'] }),
  });

  if (!tenant || !draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = (patch: Partial<StudioProfile>) => setDraft({ ...draft, ...patch });

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <header className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">{t('settings.business.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.business.intro')}</p>
      </header>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('settings.business.flow_legend')}</legend>
        <div className="flex flex-wrap gap-4">
          {FLOWS.map((flow) => (
            <label key={flow} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-flow`}
                checked={draft.paymentFlow === flow}
                onChange={() => set({ paymentFlow: flow })}
              />
              <span>{t(`settings.business.flow_${flow}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t('settings.business.switches_legend')}</legend>
        {(
          [
            ['teachesClasses', 'classes'],
            ['familyAccounts', 'families'],
            ['clientBooking', 'booking'],
          ] as const
        ).map(([field, key]) => (
          <label key={key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft[field]}
              onChange={(e) => set({ [field]: e.target.checked })}
              aria-describedby={`${id}-${key}-hint`}
            />
            <span>
              <span className="block">{t(`settings.business.${key}_label`)}</span>
              <span id={`${id}-${key}-hint`} className="block text-xs text-muted-foreground">
                {t(`settings.business.${key}_hint`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

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
