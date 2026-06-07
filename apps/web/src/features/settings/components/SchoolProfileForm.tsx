import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export function SchoolProfileForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name);
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const trimmed = name.trim();
      if (!trimmed) throw new Error(t('settings.hub.name_required'));
      const { error } = await supabase
        .from('tenants')
        .update({ name: trimmed })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.hub.profile_saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.hub.profile_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.hub.profile_description')}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="school-name">
          {t('settings.hub.school_name')}
        </label>
        <input
          id="school-name"
          type="text"
          className="form-input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="school-subdomain">
          {t('settings.hub.subdomain')}
        </label>
        <input
          id="school-subdomain"
          type="text"
          className="form-input w-full bg-gray-50"
          value={tenant.subdomain}
          readOnly
          aria-readonly="true"
        />
        <p className="text-xs text-muted-foreground">{t('settings.hub.subdomain_readonly')}</p>
      </div>

      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}

      <Button
        variant="primary"
        disabled={saveMutation.isPending}
        onClick={() => void saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
