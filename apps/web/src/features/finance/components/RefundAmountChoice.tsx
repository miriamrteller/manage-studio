import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@shared/format';
import { parseAmountToMinor } from './RecordPaymentModal';

export interface RefundAmountValue {
  kind: 'full' | 'partial';
  /** The partial amount as typed. */
  text: string;
}

/**
 * Pure: the amount_minor to send for a refund. Full → undefined (the server refunds what is
 * left). Partial → the typed amount, or null when it is not a number above 0 and up to what is
 * left.
 */
export function refundAmountToSend(value: RefundAmountValue, remainingMinor: number): number | undefined | null {
  if (value.kind === 'full') return undefined;
  const minor = parseAmountToMinor(value.text);
  if (minor == null || minor <= 0 || minor > remainingMinor) return null;
  return minor;
}

export function minorToAmountText(minor: number): string {
  return Number.isInteger(minor / 100) ? String(minor / 100) : (minor / 100).toFixed(2);
}

/**
 * Pure: what document a refund gets, by the studio's invoicing (shown before the admin confirms).
 * green_invoice issues a credit note; Takbull issues its credit document with the refund; YPay,
 * Grow, iCount and Invoice4U don't from OpalSwift, so the studio issues it in their own system;
 * with no invoicing there is no document.
 */
export function refundDocumentNoteKey(invoicingProvider: string | null | undefined): string {
  switch (invoicingProvider) {
    case 'green_invoice':
    case 'mock':
      return 'finance.refund_payment.document_credit_note';
    case 'takbull':
      return 'finance.refund_payment.document_takbull';
    case 'none':
      return 'finance.refund_payment.document_none';
    default:
      return 'finance.refund_payment.document_in_provider';
  }
}

/** "Full refund" (default) / "Partial refund" with an amount, prefilled with what is left. */
export function RefundAmountChoice({
  value,
  onChange,
  totalMinor,
  alreadyRefundedMinor,
  currency,
}: {
  value: RefundAmountValue;
  onChange: (value: RefundAmountValue) => void;
  totalMinor: number;
  alreadyRefundedMinor: number;
  currency: string;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const remainingMinor = Math.max(totalMinor - alreadyRefundedMinor, 0);
  const money = (minor: number) => formatCurrency(minor, currency, i18n.language);
  const invalid = value.kind === 'partial' && refundAmountToSend(value, remainingMinor) === null;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t('finance.refund_payment.how_much')}</legend>
      {alreadyRefundedMinor > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('finance.refund_payment.already_refunded', {
            amount: money(alreadyRefundedMinor),
            remaining: money(remainingMinor),
          })}
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${id}-kind`}
          checked={value.kind === 'full'}
          onChange={() => onChange({ ...value, kind: 'full' })}
        />
        <span>{t('finance.refund_payment.full', { amount: money(remainingMinor) })}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={`${id}-kind`}
          checked={value.kind === 'partial'}
          onChange={() => onChange({ kind: 'partial', text: value.text || minorToAmountText(remainingMinor) })}
        />
        <span>{t('finance.refund_payment.partial')}</span>
      </label>
      {value.kind === 'partial' && (
        <div className="ms-6">
          <label htmlFor={`${id}-amount`} className="block text-sm">
            {t('finance.refund_payment.partial_amount', { currency })}
          </label>
          <input
            id={`${id}-amount`}
            className="mt-1 w-full form-input"
            inputMode="decimal"
            dir="ltr"
            value={value.text}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(e) => onChange({ kind: 'partial', text: e.target.value })}
          />
          {invalid && (
            <p id={`${id}-error`} className="mt-1 text-sm text-destructive" role="alert">
              {t('finance.refund_payment.partial_invalid', { remaining: money(remainingMinor) })}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
