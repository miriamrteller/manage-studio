import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@shared/format';

interface RefundPaymentModalProps {
  paymentId: string;
  totalMinor: number;
  alreadyRefundedMinor: number;
  currency: string;
  provider?: string;
  onRefunded: () => void;
  onCancel: () => void;
}

export function RefundPaymentModal({
  paymentId,
  totalMinor,
  alreadyRefundedMinor,
  currency,
  provider,
  onRefunded,
  onCancel,
}: RefundPaymentModalProps) {
  const { t, i18n } = useTranslation();
  const remainingMinor = Math.max(totalMinor - alreadyRefundedMinor, 0);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: { payment_id: paymentId, reason: reason || undefined },
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }
    },
    onSuccess: () => {
      setMessage(t('finance.refund_payment.success', { defaultValue: 'Refund processed.' }));
      onRefunded();
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <div className="space-y-3 border border-border rounded-lg p-4">
      <h3 className="font-semibold">
        {t('finance.refund_payment.title', { defaultValue: 'Refund payment' })}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t('finance.refund_payment.amount', { defaultValue: 'Refund amount' })}:{' '}
        {formatCurrency(remainingMinor, currency, i18n.language)}
      </p>
      {provider === 'grow' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.grow_note', {
            defaultValue:
              'Grow typically allows a full refund only on the same day as the charge. The provider message is shown below if it rejects the refund.',
          })}
        </p>
      )}
      {provider === 'icount' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.icount_note', {
            defaultValue:
              'iCount may issue a credit note instead of reversing the charge. The provider message is shown below if the refund is rejected. Mock mode completes instantly.',
          })}
        </p>
      )}
      {provider === 'invoice4u' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.invoice4u_note', {
            defaultValue:
              'Invoice4U refunds the card charge and may issue a credit document when the original payment created a tax receipt.',
          })}
        </p>
      )}
      {provider !== 'grow' && provider !== 'icount' && provider !== 'invoice4u' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.bundled_note', {
            defaultValue:
              'The refund is sent to your payment provider. Any provider message is shown below if it fails.',
          })}
        </p>
      )}
      <label className="block text-sm">
        {t('finance.refund_payment.reason', { defaultValue: 'Reason (optional)' })}
        <input
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={mutation.isPending || remainingMinor <= 0}
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t('finance.refund_payment.submit', { defaultValue: 'Process refund' })}
        </Button>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
