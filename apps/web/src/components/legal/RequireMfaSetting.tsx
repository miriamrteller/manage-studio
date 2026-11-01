import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

/**
 * Settings → Security: "Require two-step sign-in for all admins of this
 * studio" (tenants.require_admin_mfa, off by default). Only studio admins can
 * save it: the tenants update policy allows tenant_admin only.
 */
export function RequireMfaSetting() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const { data: required, isLoading } = useQuery({
    queryKey: ['tenant-require-mfa', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('require_admin_mfa')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.require_admin_mfa === true;
    },
  });

  const save = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.from('tenants').update({ require_admin_mfa: next }).eq('id', tenant!.id);
      if (error) throw error;
      return next;
    },
    onSuccess: async (next) => {
      setMessage(next ? t('legal.security.require_saved_on') : t('legal.security.require_saved_off'));
      await queryClient.invalidateQueries({ queryKey: ['tenant-require-mfa'] });
      await queryClient.invalidateQueries({ queryKey: ['mfa-assurance'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;

  return (
    <section className="space-y-2 rounded-md border p-4" aria-labelledby="require-mfa-heading">
      <h3 id="require-mfa-heading" className="font-medium">
        {t('legal.security.require_heading')}
      </h3>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={required === true}
          disabled={isLoading || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          aria-describedby="require-mfa-help"
          data-testid="require-admin-mfa"
        />
        <span>{t('legal.security.require_label')}</span>
      </label>
      <p id="require-mfa-help" className="text-xs text-muted-foreground">
        {t('legal.security.require_help')}
      </p>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
