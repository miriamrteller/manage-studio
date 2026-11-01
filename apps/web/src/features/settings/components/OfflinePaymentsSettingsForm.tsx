import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

export const OFFLINE_PAYMENTS = 'offline';
/** Providers a studio can switch back to for online payments; `mock` is never offered. */
export const ONLINE_PAYMENT_PROVIDERS = ['grow', 'icount', 'invoice4u', 'ypay', 'tranzila'] as const;
const MAX_INSTRUCTIONS = 2000;

/** Pure: what to store for the chosen mode. */
export function resolvePaymentProviderToSave(input: { offline: boolean; onlineProvider: string }): string {
  return input.offline ? OFFLINE_PAYMENTS : input.onlineProvider;
}

/**
 * Admin → Setup → Settings: "How parents pay". Offline = tenants.payment_provider 'offline'
 * (public checkout shows "Pay at the studio" with the studio's instructions; admins record
 * each payment). Online = a provider slug; its keys live on the provider's own page.
 */
export function OfflinePaymentsSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const savedProvider = tenant?.payment_provider ?? 'grow';
  const savedInstructions = tenant?.offline_payment_instructions ?? '';
  const [offline, setOffline] = useState(savedProvider === OFFLINE_PAYMENTS);
  const [onlineProvider, setOnlineProvider] = useState<string>(
    savedProvider !== OFFLINE_PAYMENTS ? savedProvider : 'grow',
  );
  const [instructions, setInstructions] = useState(savedInstructions);
  const [message, setMessage] = useState<string | null>(null);

  // Depend on saved primitives, not the tenant object, so a refetch with the same values
  // does not reset what the admin is typing.
  useEffect(() => {
    setOffline(savedProvider === OFFLINE_PAYMENTS);
    if (savedProvider !== OFFLINE_PAYMENTS) setOnlineProvider(savedProvider);
  }, [savedProvider]);
  useEffect(() => {
    setInstructions(savedInstructions);
  }, [savedInstructions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const { error } = await supabase
        .from('tenants')
        .update({
          payment_provider: resolvePaymentProviderToSave({ offline, onlineProvider }),
          offline_payment_instructions: instructions.trim() || null,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.offline_payments.saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="offline-payments-title">
      <h2 id="offline-payments-title" className="text-lg font-semibold text-foreground">
        {t('settings.offline_payments.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.offline_payments.description')}</p>

      <div className="flex items-start gap-2 text-sm">
        <input
          id="offline-payments-enabled"
          type="checkbox"
          className="mt-1"
          checked={offline}
          aria-describedby="offline-payments-enabled-hint"
          onChange={(e) => setOffline(e.target.checked)}
        />
        <div>
          <label htmlFor="offline-payments-enabled" className="font-medium">
            {t('settings.offline_payments.enabled_label')}
          </label>
          <p id="offline-payments-enabled-hint" className="text-muted-foreground">
            {t('settings.offline_payments.enabled_hint')}
          </p>
        </div>
      </div>

      {offline ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="offline-payment-instructions">
            {t('settings.offline_payments.instructions_label')}
          </label>
          <textarea
            id="offline-payment-instructions"
            className="form-input w-full min-h-32"
            rows={5}
            maxLength={MAX_INSTRUCTIONS}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t('settings.offline_payments.instructions_placeholder')}
            aria-describedby="offline-payment-instructions-hint"
          />
          <p id="offline-payment-instructions-hint" className="text-xs text-muted-foreground">
            {t('settings.offline_payments.instructions_hint')}
          </p>
          <p className="text-sm rounded-lg border border-border bg-muted/40 px-3 py-2" role="note">
            {t('settings.offline_payments.receipts_note')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="offline-payments-provider">
            {t('settings.payments.provider')}
          </label>
          <select
            id="offline-payments-provider"
            className="form-input w-full"
            value={onlineProvider}
            onChange={(e) => setOnlineProvider(e.target.value)}
          >
            {ONLINE_PAYMENT_PROVIDERS.map((slug) => (
              <option key={slug} value={slug}>
                {t(`settings.offline_payments.providers.${slug}`)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('settings.offline_payments.provider_hint')}</p>
        </div>
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
