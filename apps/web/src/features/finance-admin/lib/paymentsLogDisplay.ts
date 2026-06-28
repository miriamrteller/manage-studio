import type { PaymentLogRow } from '@shared/schemas';

/** Shared styling for invoice/receipt links in the payments log UI. */
export const paymentDocumentLinkClassName =
  'font-medium text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export type PayerDisplayKind = 'person' | 'family' | 'empty';

export interface PayerDisplay {
  kind: PayerDisplayKind;
  label: string | null;
}

export function getPayerDisplay(
  row: Pick<PaymentLogRow, 'person_id' | 'account_id' | 'person'>,
  familyPaymentLabel: string,
): PayerDisplay {
  if (row.person_id && row.person?.name) {
    return { kind: 'person', label: row.person.name };
  }
  if (row.account_id) {
    return { kind: 'family', label: familyPaymentLabel };
  }
  return { kind: 'empty', label: null };
}

export function isRefundRow(row: Pick<PaymentLogRow, 'charge_type' | 'total_amount_minor'>): boolean {
  return row.charge_type === 'refund' || row.total_amount_minor < 0;
}

export type PaymentCaptureSource = 'manual' | 'online';

export function getPaymentCaptureSource(provider: string): PaymentCaptureSource {
  return provider === 'manual' ? 'manual' : 'online';
}

export function getCaptureSourceLabelKey(source: PaymentCaptureSource): string {
  return `finance.capture_source.${source}`;
}

/** Date filter applies to paid_at only — pending rows excluded when filter active. */
export function shouldIncludeInPaidDateFilter(
  paidAt: string | null | undefined,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!paidAt) return false;
  const paidDate = paidAt.slice(0, 10);
  if (dateFrom && paidDate < dateFrom) return false;
  if (dateTo && paidDate > dateTo) return false;
  return true;
}
