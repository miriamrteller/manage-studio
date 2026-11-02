import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

type LocaleRow = {
  language_default: 'he' | 'en';
};

/**
 * Settings → Language & Region: the studio's main language. Country, currency
 * and phone region are set when the studio is created (Israel, ILS, IL) and are
 * not edited here.
 */
export function LocaleSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [languageDefault, setLanguageDefault] = useState<'he' | 'en'>('he');
  const [message, setMessage] = useState<string | null>(null);

  const { data: localeRow } = useQuery({
    queryKey: ['tenant-locale', tenant?.id],
    queryFn: async (): Promise<LocaleRow | null> => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('tenants')
        .select('language_default')
        .eq('id', tenant.id)
        .single();
      if (error) throw error;
      return data as LocaleRow;
    },
    enabled: Boolean(tenant?.id),
  });

  useEffect(() => {
    if (!localeRow) return;
    setLanguageDefault(localeRow.language_default);
  }, [localeRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const { error } = await supabase
        .from('tenants')
        .update({ language_default: languageDefault })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.hub.locale_saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
      await queryClient.invalidateQueries({ queryKey: ['tenant-locale', tenant?.id] });
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.hub.locale_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.hub.locale_description')}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="language-default">
          {t('settings.hub.language_default')}
        </label>
        <select
          id="language-default"
          className="form-input w-full"
          value={languageDefault}
          onChange={(e) => setLanguageDefault(e.target.value as 'he' | 'en')}
        >
          <option value="he">{t('settings.hub.language_he')}</option>
          <option value="en">{t('settings.hub.language_en')}</option>
        </select>
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
