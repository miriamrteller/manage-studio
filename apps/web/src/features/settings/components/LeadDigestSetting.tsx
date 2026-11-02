import { useId } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { useAuthSession } from '@/hooks/useAuth';
import queryClient from '@/lib/query-client';

/**
 * Settings: "Daily follow-up email". On by default for every studio admin; a
 * row in lead_digest_optouts switches it off for this admin only.
 */
export function LeadDigestSetting() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const id = useId();

  const optedOut = useQuery({
    queryKey: ['lead-digest-optout', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_digest_optouts').select('user_id').eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });

  const toggle = useMutation({
    mutationFn: async (wantEmail: boolean) => {
      const { error } = wantEmail
        ? await supabase.from('lead_digest_optouts').delete().eq('user_id', userId!)
        : await supabase.from('lead_digest_optouts').insert({ user_id: userId!, tenant_id: tenant!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead-digest-optout'] }),
  });

  if (!tenant || !userId) return null;
  const on = optedOut.data === false;

  return (
    <section className="space-y-2" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          {t('settings.lead_digest.title')}
        </h2>
        <InfoTip label={t('pages.crm.help.tip_label', { topic: t('settings.lead_digest.title') })}>
          {t('pages.crm.help.tip_digest')}
        </InfoTip>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={on}
          disabled={optedOut.isLoading || toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
          aria-describedby={`${id}-hint`}
        />
        <span>{t('settings.lead_digest.label')}</span>
      </label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t('settings.lead_digest.hint')}
      </p>
      {toggle.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.lead_digest.error')}
        </p>
      )}
    </section>
  );
}
