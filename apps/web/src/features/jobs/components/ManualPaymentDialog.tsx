import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { formatMinor } from '../lib/jobPaymentFormat';
import type { JobPaymentRequest } from '../services/jobPaymentService';

export type ManualAction =
  | { kind: 'mark_paid'; request: JobPaymentRequest }
  | { kind: 'refund'; request: JobPaymentRequest };

interface Props {
  action: ManualAction | null;
  language: string;
  isSubmitting: boolean;
  onClose: () => void;
  onMarkPaid: (requestId: string, method: 'cash' | 'bank_transfer', note?: string) => Promise<unknown>;
  onRefund: (paymentId: string, reason?: string) => Promise<unknown>;
}

/**
 * Human-approved money actions (never automatic): record a cash/bank payment,
 * or record a refund already made outside the platform (YPay has no refund API).
 */
export function ManualPaymentDialog({ action, language, isSubmitting, onClose, onMarkPaid, onRefund }: Props) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;
  const { request } = action;
  const amount = formatMinor(request.amount_minor, request.currency, language);
  const isRefund = action.kind === 'refund';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRefund) {
        if (!request.payment_id) throw new Error(t('pages.jobs.payments.manual.noPayment'));
        await onRefund(request.payment_id, note || undefined);
      } else {
        await onMarkPaid(request.id, method, note || undefined);
      }
      setNote('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isRefund ? t('pages.jobs.payments.manual.refundTitle') : t('pages.jobs.payments.manual.paidTitle')}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm">
          <bdi>{request.label}</bdi> · <bdi dir="ltr">{amount}</bdi>
        </p>
        {isRefund ? (
          <p className="text-sm text-muted-foreground">{t('pages.jobs.payments.manual.refundHint')}</p>
        ) : (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t('pages.jobs.payments.manual.method')}</legend>
            {(['bank_transfer', 'cash'] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="jpr-method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                {t(`pages.jobs.payments.manual.method_${m}`)}
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <Label htmlFor="jpr-note">{isRefund ? t('pages.jobs.payments.manual.reason') : t('pages.jobs.payments.manual.note')}</Label>
          <Textarea id="jpr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
        </div>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant={isRefund ? 'destructive' : 'primary'} size="sm" isLoading={isSubmitting}>
            {isRefund ? t('pages.jobs.payments.manual.confirmRefund') : t('pages.jobs.payments.manual.confirmPaid')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Modal>
  );
}
