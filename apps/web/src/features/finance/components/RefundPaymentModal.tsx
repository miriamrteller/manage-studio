import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@shared/format';

/** Providers whose API has no refund call: the admin refunds in their dashboard, then records it. */
const MANUAL_REFUND_PROVIDERS: readonly string[] = ['ypay'];

/** The JSON body of a non-2xx edge function response (supabase-js FunctionsHttpError). */
async function readFunctionErrorBody(error: unknown): Promise<{ error?: string; code?: string } | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    return (await context.json()) as { error?: string; code?: string };
  } catch {
    return null;
  }
}

class RefundError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

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
  // Manual = the refund was already made in the provider's dashboard; we only record it.
  const [manualMode, setManualMode] = useState(MANUAL_REFUND_PROVIDERS.includes(provider ?? ''));
  const providerName = t(`settings.provider_names.${provider ?? 'manual'}`, { defaultValue: provider ?? '' });

  const mutation = useMutation({
    mutationFn: async (manual: boolean) => {
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: { payment_id: paymentId, reason: reason || undefined, ...(manual ? { manual: true } : {}) },
      });
      if (error) {
        const body = await readFunctionErrorBody(error);
        throw new RefundError(body?.error ?? error.message, body?.code);
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new RefundError(String(data.error), (data as { code?: string }).code);
      }
    },
    onSuccess: (_data, manual) => {
      setMessage(
        manual
          ? t('finance.refund_payment.manual_success', { defaultValue: 'Refund recorded.' })
          : t('finance.refund_payment.success', { defaultValue: 'Refund processed.' }),
      );
      onRefunded();
    },
    onError: (err: Error) => {
      if (err instanceof RefundError && err.code === 'manual_refund_required') {
        // The provider has no refund API (or it is not switched on): offer to record it instead.
        setManualMode(true);
        setMessage(null);
        return;
      }
      setMessage(err.message);
    },
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
      {manualMode && (
        <p className="text-sm rounded border border-border bg-muted/40 px-3 py-2" role="note">
          {t('finance.refund_payment.manual_note', {
            provider: providerName,
            defaultValue:
              '{{provider}} refunds cannot be made from OpalSwift. First refund the payment in your {{provider}} dashboard, then press "Record refund" so OpalSwift shows it as refunded. No money is moved by this button.',
          })}
        </p>
      )}
      {!manualMode && provider === 'grow' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.grow_note', {
            defaultValue:
              'Grow typically allows a full refund only on the same day as the charge. The provider message is shown below if it rejects the refund.',
          })}
        </p>
      )}
      {!manualMode && provider === 'icount' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.icount_note', {
            defaultValue:
              'iCount may issue a credit note instead of reversing the charge. The provider message is shown below if the refund is rejected. Mock mode completes instantly.',
          })}
        </p>
      )}
      {!manualMode && provider === 'invoice4u' && (
        <p className="text-xs text-muted-foreground">
          {t('finance.refund_payment.invoice4u_note', {
            defaultValue:
              'Invoice4U refunds the card charge and may issue a credit document when the original payment created a tax receipt.',
          })}
        </p>
      )}
      {!manualMode && provider !== 'grow' && provider !== 'icount' && provider !== 'invoice4u' && (
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
          onClick={() => mutation.mutate(manualMode)}
        >
          {manualMode
            ? t('finance.refund_payment.manual_submit', { defaultValue: 'Record refund' })
            : t('finance.refund_payment.submit', { defaultValue: 'Process refund' })}
        </Button>
        <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
