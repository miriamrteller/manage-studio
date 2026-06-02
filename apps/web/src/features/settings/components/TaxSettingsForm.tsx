import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export function TaxSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [vatRatePercent, setVatRatePercent] = useState('17');
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setVatRatePercent(String(Math.round(tenant.vat_rate * 10000) / 100));
    setPricesIncludeVat(tenant.prices_include_vat);
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const parsed = Number(vatRatePercent);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
        throw new Error(t('settings.tax.vat_rate_invalid'));
      }
      const { error } = await supabase
        .from('tenants')
        .update({
          vat_rate: parsed / 100,
          prices_include_vat: pricesIncludeVat,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.tax.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  if (!tenant) {
    return null;
  }

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.tax.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.tax.description')}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="vat-rate-percent">
          {t('settings.tax.vat_rate')}
        </label>
        <input
          id="vat-rate-percent"
          type="number"
          min={0}
          max={100}
          step={0.01}
          className="form-input w-full"
          value={vatRatePercent}
          onChange={(e) => setVatRatePercent(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('settings.tax.vat_rate_help')}</p>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="prices-include-vat"
          type="checkbox"
          className="mt-1"
          checked={pricesIncludeVat}
          onChange={(e) => setPricesIncludeVat(e.target.checked)}
        />
        <div>
          <label className="text-sm font-medium" htmlFor="prices-include-vat">
            {t('settings.tax.prices_include_vat')}
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.tax.prices_include_vat_help')}
          </p>
        </div>
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
