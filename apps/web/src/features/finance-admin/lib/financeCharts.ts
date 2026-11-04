import type { PaymentLogRow } from '@shared/schemas';
import { TIMEZONE } from '@/lib/constants';
import { paymentDocumentStatus, vatSplitFromDocument } from './paymentDocuments';

/**
 * Pure aggregations for the finance charts and the VAT-period summary.
 * Amounts are gross minor units; refunds are negative rows and count against their month.
 */

/** YYYY-MM of a timestamp in Israel time. */
export function jerusalemMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}`;
}

/** The last `count` months ending with the month of `reference`, oldest first (YYYY-MM). */
export function lastMonths(count: number, reference: Date = new Date()): string[] {
  const [y, m] = jerusalemMonth(reference.toISOString()).split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export interface MonthTotal {
  month: string;
  /** Money received (sales). */
  paidMinor: number;
  /** Refunds (negative). */
  refundsMinor: number;
  /** paid + refunds. */
  netMinor: number;
}

export function revenueByMonth(rows: PaymentLogRow[], months: string[]): MonthTotal[] {
  const map = new Map(months.map((month) => [month, { month, paidMinor: 0, refundsMinor: 0, netMinor: 0 }]));
  for (const row of rows) {
    if (!row.paid_at) continue;
    const bucket = map.get(jerusalemMonth(row.paid_at));
    if (!bucket) continue;
    if (row.total_amount_minor < 0) bucket.refundsMinor += row.total_amount_minor;
    else bucket.paidMinor += row.total_amount_minor;
    bucket.netMinor += row.total_amount_minor;
  }
  return months.map((m) => map.get(m)!);
}

export interface MethodTotal {
  method: string;
  totalMinor: number;
  count: number;
}

/** Net received per payment method, largest first. Unknown method → "other". */
export function revenueByMethod(rows: PaymentLogRow[]): MethodTotal[] {
  const map = new Map<string, MethodTotal>();
  for (const row of rows) {
    const method = row.payment_method ?? 'other';
    const entry = map.get(method) ?? { method, totalMinor: 0, count: 0 };
    entry.totalMinor += row.total_amount_minor;
    if (row.total_amount_minor > 0) entry.count += 1;
    map.set(method, entry);
  }
  return [...map.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

export interface VatPeriodSummary {
  /** Everything received in the period, refunds subtracted. */
  grossMinor: number;
  /** Covered by tax invoice-receipts and credit documents: VAT included. */
  vatDocumentsGrossMinor: number;
  pretaxMinor: number;
  vatMinor: number;
  /** Covered by receipts: no VAT on the document. */
  receiptsMinor: number;
  /** Documents whose type the provider didn't tell us. */
  unknownTypeMinor: number;
  /** Refunds (negative), included in the totals above by their document. */
  refundsMinor: number;
  /** Payments with no document: their gross and how many. */
  withoutDocumentMinor: number;
  withoutDocumentCount: number;
}

/**
 * VAT-period figures from the documents issued. [[ACCOUNTANT: confirm]] this is a helper
 * for the accountant, not a VAT return.
 */
export function summariseVatPeriod(
  rows: PaymentLogRow[],
  tenant: { invoicing_provider?: string | null } | null | undefined,
): VatPeriodSummary {
  const s: VatPeriodSummary = {
    grossMinor: 0,
    vatDocumentsGrossMinor: 0,
    pretaxMinor: 0,
    vatMinor: 0,
    receiptsMinor: 0,
    unknownTypeMinor: 0,
    refundsMinor: 0,
    withoutDocumentMinor: 0,
    withoutDocumentCount: 0,
  };
  for (const row of rows) {
    const total = row.total_amount_minor;
    s.grossMinor += total;
    if (total < 0) s.refundsMinor += total;
    const doc = paymentDocumentStatus(row, tenant);
    if (!doc.issued) {
      s.withoutDocumentMinor += total;
      s.withoutDocumentCount += 1;
      continue;
    }
    if (doc.kind === 'receipt') {
      s.receiptsMinor += total;
    } else if (doc.kind === 'tax_invoice_receipt' || doc.kind === 'credit_note') {
      const split = vatSplitFromDocument(total, doc.kind, row.paid_at ?? row.created_at);
      s.vatDocumentsGrossMinor += total;
      s.pretaxMinor += split.pretaxMinor ?? 0;
      s.vatMinor += split.vatMinor ?? 0;
    } else {
      s.unknownTypeMinor += total;
    }
  }
  return s;
}
