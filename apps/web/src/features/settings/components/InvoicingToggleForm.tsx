import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

/** Providers a studio can turn invoicing back on with. `mock` and `none` are not offered. */
export const INVOICING_ON_PROVIDERS = ['grow', 'icount', 'invoice4u', 'ypay', 'tranzila', 'yesh', 'green_invoice'] as const;
type InvoicingOnProvider = (typeof INVOICING_ON_PROVIDERS)[number];

export const INVOICING_OFF = 'none';

function isOnProvider(value: string | null | undefined): value is InvoicingOnProvider {
  return (INVOICING_ON_PROVIDERS as readonly string[]).includes(value ?? '');
}

/** Pure: the slug to store for a given toggle state. */
export function resolveInvoicingProviderToSave(input: {
  enabled: boolean;
  selectedProvider: string;
}): string {
  return input.enabled ? input.selectedProvider : INVOICING_OFF;
}

/**
 * Admin → Setup → Settings: "Tax documents". Off = tenants.invoicing_provider 'none' and no
 * document is ever enqueued. On = the chosen provider; credentials live on the invoicing page.
 */
export function InvoicingToggleForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const current = tenant?.invoicing_provider ?? 'grow';
  const paymentProvider = tenant?.payment_provider ?? null;
  const [enabled, setEnabled] = useState(current !== INVOICING_OFF);
  const [selectedProvider, setSelectedProvider] = useState<string>(
    isOnProvider(current) ? current : isOnProvider(paymentProvider) ? paymentProvider : 'grow',
  );
  const [message, setMessage] = useState<string | null>(null);

  // Depend on the saved slug, not the tenant object, so a refetch does not reset the form.
  useEffect(() => {
    setEnabled(current !== INVOICING_OFF);
    if (isOnProvider(current)) setSelectedProvider(current);
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const { error } = await supabase
        .from('tenants')
        .update({ invoicing_provider: resolveInvoicingProviderToSave({ enabled, selectedProvider }) })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.invoicing_toggle.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="invoicing-toggle-title">
      <h2 id="invoicing-toggle-title" className="text-lg font-semibold text-foreground">
        {t('settings.invoicing_toggle.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.invoicing_toggle.description')}</p>

      <div className="flex items-start gap-2 text-sm">
        <input
          id="invoicing-toggle-enabled"
          type="checkbox"
          className="mt-1"
          checked={enabled}
          aria-describedby="invoicing-toggle-enabled-hint"
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <div>
          <label htmlFor="invoicing-toggle-enabled" className="font-medium">
            {t('settings.invoicing_toggle.enabled_label')}
          </label>
          <p id="invoicing-toggle-enabled-hint" className="text-muted-foreground">
            {t('settings.invoicing_toggle.enabled_hint')}
          </p>
        </div>
      </div>

      {enabled ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="invoicing-toggle-provider">
            {t('settings.invoicing.provider')}
          </label>
          <select
            id="invoicing-toggle-provider"
            className="form-input w-full"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            {INVOICING_ON_PROVIDERS.map((slug) => (
              <option key={slug} value={slug}>
                {t(`settings.invoicing_toggle.providers.${slug}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('settings.invoicing_toggle.credentials_hint')}</p>
        </div>
      ) : (
        <p className="text-sm rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">
          {t('settings.invoicing_toggle.off_note')}
        </p>
      )}

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        disabled={saveMutation.isPending}
        isLoading={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
