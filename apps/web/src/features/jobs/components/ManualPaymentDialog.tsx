import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/hooks/useTenant';
import {
  RefundAmountChoice,
  refundAmountToSend,
  refundDocumentNoteKey,
  type RefundAmountValue,
} from '@/features/finance/components/RefundAmountChoice';
import type { ManualPaymentMethod } from '@/features/finance/lib/manualPaymentMethods';
import { useManualPaymentMethods } from '@/features/finance/hooks/useManualPaymentMethods';
import { NoDocumentConfirmationOption } from '@/features/finance/components/NoDocumentConfirmationOption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { formatMinor } from '../lib/jobPaymentFormat';
import type { JobPaymentRequest } from '../services/jobPaymentService';

export type ManualAction =
  | { kind: 'mark_paid'; request: JobPaymentRequest }
  | { kind: 'refund'; request: JobPaymentRequest }
  /** "Record a payment" with nothing open to pay: the amount starts from what is left of the package. */
  | { kind: 'record_new'; amountMinor: number | null; currency: string };

interface Props {
  action: ManualAction | null;
  language: string;
  isSubmitting: boolean;
  onClose: () => void;
  onMarkPaid: (requestId: string, method: ManualPaymentMethod, note?: string, sendConfirmation?: boolean) => Promise<unknown>;
  onRefund: (paymentId: string, reason?: string, amountMinor?: number) => Promise<unknown>;
  /** Makes a payment request for the amount and records it as paid. */
  onRecordNew?: (amountMinor: number, method: ManualPaymentMethod, note?: string, sendConfirmation?: boolean) => Promise<unknown>;
}

/** "120" or "120.50" → minor units; null when not a positive amount. */
export function amountTextToMinor(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/**
 * Human-approved money actions (never automatic): record a cash/bank payment,
 * or record a refund already made outside the platform (YPay has no refund API).
 */
export function ManualPaymentDialog({ action, language, isSubmitting, onClose, onMarkPaid, onRefund, onRecordNew }: Props) {
  if (!action) return null;
  // Keyed so each opening starts from its own prefilled amount.
  return (
    <ManualPaymentForm
      key={action.kind === 'record_new' ? `new-${action.amountMinor ?? ''}` : `${action.kind}-${action.request.id}`}
      action={action}
      language={language}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onMarkPaid={onMarkPaid}
      onRefund={onRefund}
      onRecordNew={onRecordNew}
    />
  );
}

function ManualPaymentForm({ action, language, isSubmitting, onClose, onMarkPaid, onRefund, onRecordNew }: Props & { action: ManualAction }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const methods = useManualPaymentMethods();
  const [method, setMethod] = useState<ManualPaymentMethod>('bank_transfer');
  const [note, setNote] = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [refundAmount, setRefundAmount] = useState<RefundAmountValue>({ kind: 'full', text: '' });
  const [error, setError] = useState<string | null>(null);
  const [newAmount, setNewAmount] = useState(() =>
    action.kind === 'record_new' && action.amountMinor ? String(action.amountMinor / 100) : '',
  );

  const request = action.kind === 'record_new' ? null : action.request;
  const isNew = action.kind === 'record_new';
  const newAmountMinor = amountTextToMinor(newAmount);
  const amount = request ? formatMinor(request.amount_minor, request.currency, language) : '';
  const isRefund = action.kind === 'refund';
  const paidMinor = request ? request.payment?.total_amount_minor ?? request.amount_minor : 0;
  const refundedMinor = request?.payment?.refund_amount_minor ?? 0;
  const remainingMinor = Math.max(paidMinor - refundedMinor, 0);
  const refundMinor = refundAmountToSend(refundAmount, remainingMinor);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (action.kind === 'record_new') {
        if (newAmountMinor === null || !onRecordNew) {
          setError(t('pages.jobs.payments.form.amountInvalid'));
          return;
        }
        await onRecordNew(newAmountMinor, method, note || undefined, sendConfirmation);
      } else if (isRefund && request) {
        if (!request.payment_id) throw new Error(t('pages.jobs.payments.manual.noPayment'));
        if (refundMinor === null) return;
        await onRefund(request.payment_id, note || undefined, refundMinor);
      } else if (request) {
        await onMarkPaid(request.id, method, note || undefined, sendConfirmation);
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
      title={isRefund ? t('pages.jobs.payments.manual.refundTitle') : t('finance.record_payment.title')}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-3">
        {isNew ? (
          <div>
            <Label htmlFor="jpr-new-amount">
              {t('finance.record_payment.amount', { currency: action.kind === 'record_new' ? action.currency : '' })}
            </Label>
            <Input
              id="jpr-new-amount"
              inputMode="decimal"
              dir="ltr"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              required
            />
          </div>
        ) : (
          request && (
            <p className="text-sm">
              <bdi>{request.label}</bdi> · <bdi dir="ltr">{amount}</bdi>
            </p>
          )
        )}
        {isRefund ? (
          <>
            <p className="text-sm text-muted-foreground">{t('pages.jobs.payments.manual.refundHint')}</p>
            <RefundAmountChoice
              value={refundAmount}
              onChange={setRefundAmount}
              totalMinor={paidMinor}
              alreadyRefundedMinor={refundedMinor}
              currency={request?.currency ?? ''}
            />
            <p className="text-xs text-muted-foreground">
              {t(refundDocumentNoteKey(tenant?.invoicing_provider), {
                provider: t(`settings.offline_payments.providers.${tenant?.invoicing_provider ?? ''}`, {
                  defaultValue: tenant?.invoicing_provider ?? '',
                }),
              })}
            </p>
          </>
        ) : (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t('pages.jobs.payments.manual.method')}</legend>
            {(['bank_transfer', 'cash', 'bit'] as const).filter((m) => methods.includes(m)).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="jpr-method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                {m === 'bit' ? t('payment_methods.bit') : t(`pages.jobs.payments.manual.method_${m}`)}
              </label>
            ))}
          </fieldset>
        )}
        <div>
          <Label htmlFor="jpr-note">{isRefund ? t('pages.jobs.payments.manual.reason') : t('pages.jobs.payments.manual.note')}</Label>
          <Textarea id="jpr-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
        </div>
        {!isRefund && <NoDocumentConfirmationOption checked={sendConfirmation} onChange={setSendConfirmation} />}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={isRefund ? 'destructive' : 'primary'}
            size="sm"
            isLoading={isSubmitting}
            disabled={isRefund && refundMinor === null}
          >
            {isRefund ? t('pages.jobs.payments.manual.confirmRefund') : t('pages.jobs.payments.manual.confirmPaid')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Modal>
  );
}
