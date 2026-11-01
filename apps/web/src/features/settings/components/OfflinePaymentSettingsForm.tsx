import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

const MAX_LENGTH = 2000;

/**
 * Studio with no online payment provider (tenants.payment_provider = 'none'): the text
 * parents see on the public checkout, the confirmation screen and in payment reminders.
 */
export function OfflinePaymentSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [instructions, setInstructions] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setInstructions(tenant?.offline_payment_instructions ?? '');
  }, [tenant?.offline_payment_instructions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const trimmed = instructions.trim();
      const { error } = await supabase
        .from('tenants')
        .update({ offline_payment_instructions: trimmed || null })
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

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="offline-payment-instructions">
          {t('settings.offline_payments.instructions_label')}
        </label>
        <textarea
          id="offline-payment-instructions"
          className="form-input w-full min-h-32"
          rows={5}
          maxLength={MAX_LENGTH}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t('settings.offline_payments.instructions_placeholder')}
          aria-describedby="offline-payment-instructions-hint"
        />
        <p id="offline-payment-instructions-hint" className="text-xs text-muted-foreground">
          {t('settings.offline_payments.instructions_hint')}
        </p>
      </div>

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
