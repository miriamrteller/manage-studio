import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

type LocaleRow = {
  language_default: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  phone_region: string;
};

export function LocaleSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [languageDefault, setLanguageDefault] = useState<'he' | 'en'>('he');
  const [country, setCountry] = useState<'IL' | 'US'>('IL');
  const [currency, setCurrency] = useState('ILS');
  const [phoneRegion, setPhoneRegion] = useState('IL');
  const [message, setMessage] = useState<string | null>(null);

  const { data: localeRow } = useQuery({
    queryKey: ['tenant-locale', tenant?.id],
    queryFn: async (): Promise<LocaleRow | null> => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('tenants')
        .select('language_default, country, currency, phone_region')
        .eq('id', tenant.id)
        .single();
      if (error) throw error;
      return data as LocaleRow;
    },
    enabled: Boolean(tenant?.id),
  });

  const { data: hasPayments } = useQuery({
    queryKey: ['tenant-has-payments', tenant?.id],
    queryFn: async (): Promise<boolean> => {
      if (!tenant?.id) return false;
      const { count, error } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: Boolean(tenant?.id),
  });

  useEffect(() => {
    if (!localeRow) return;
    setLanguageDefault(localeRow.language_default);
    setCountry(localeRow.country);
    setCurrency(localeRow.currency);
    setPhoneRegion(localeRow.phone_region);
  }, [localeRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      if (hasPayments && currency !== localeRow?.currency) {
        throw new Error(t('settings.hub.currency_locked'));
      }
      const { error } = await supabase
        .from('tenants')
        .update({
          language_default: languageDefault,
          country,
          currency: currency.trim().toUpperCase(),
          phone_region: phoneRegion.trim().toUpperCase(),
        })
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

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="country">
          {t('settings.hub.country')}
        </label>
        <select
          id="country"
          className="form-input w-full"
          value={country}
          onChange={(e) => setCountry(e.target.value as 'IL' | 'US')}
        >
          <option value="IL">{t('settings.hub.country_il')}</option>
          <option value="US">{t('settings.hub.country_us')}</option>
        </select>
        {hasPayments && (
          <p className="text-xs text-amber-700">{t('settings.hub.country_change_warning')}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="currency">
          {t('settings.hub.currency')}
        </label>
        <input
          id="currency"
          type="text"
          className="form-input w-full"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          disabled={hasPayments}
          maxLength={3}
          aria-describedby={hasPayments ? 'currency-locked-hint' : undefined}
        />
        {hasPayments && (
          <p id="currency-locked-hint" className="text-xs text-muted-foreground">
            {t('settings.hub.currency_locked_hint')}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="phone-region">
          {t('settings.hub.phone_region')}
        </label>
        <input
          id="phone-region"
          type="text"
          className="form-input w-full"
          value={phoneRegion}
          onChange={(e) => setPhoneRegion(e.target.value)}
          maxLength={2}
        />
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
