import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import {
  ACCEPT_UNRECEIPTED_BIT_QUERY,
  useAcceptUnreceiptedBit,
} from '@/features/finance/hooks/useManualPaymentMethods';
import { invoicingReceiptsRecordedPayments } from '@/features/finance/lib/manualPaymentMethods';

/**
 * Settings → Payment: "Accept Bit / PayBox". Only for studios whose invoicing (Grow, iCount,
 * Invoice4U) can't receipt a payment recorded in OpalSwift: Bit / PayBox is hidden in
 * "Record a payment" unless the studio switches it on and issues those receipts itself.
 */
export function BitPaymentSetting() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const queryClient = useQueryClient();
  const accepted = useAcceptUnreceiptedBit();

  const save = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.from('tenants').update({ accept_unreceipted_bit: on }).eq('id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCEPT_UNRECEIPTED_BIT_QUERY, tenant?.id] }),
  });

  if (!tenant || invoicingReceiptsRecordedPayments(tenant.invoicing_provider)) return null;
  const provider = t(`settings.offline_payments.providers.${tenant.invoicing_provider}`, {
    defaultValue: tenant.invoicing_provider,
  });

  return (
    <section className="space-y-2 max-w-lg" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.payments.bit_title')}
      </h2>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={accepted}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          aria-describedby={`${id}-hint`}
        />
        <span>{t('settings.payments.bit_label')}</span>
      </label>
      <p id={`${id}-hint`} className="ms-6 text-xs text-muted-foreground">
        {t('settings.payments.bit_hint', { provider })}
      </p>
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('settings.payments.bit_error')}
        </p>
      )}
    </section>
  );
}
