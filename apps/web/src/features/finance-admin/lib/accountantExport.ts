import type { TFunction } from 'i18next';
import type { PaymentLogRow } from '@shared/schemas';
import { TIMEZONE } from '@/lib/constants';
import { buildCsvContent } from './financeAdminUtils';
import { getPayerDisplay } from './paymentsLogDisplay';
import { paymentDocumentStatus, vatSplitFromDocument } from './paymentDocuments';

/**
 * Accountant export: one row per payment or refund in the period, with the tax document
 * (type, number, link, allocation number) or the reason there is none, and the VAT split
 * taken from the document issued (never from business status).
 */

/** Statuses that mean money moved; pending / failed rows are left out. */
export const ACCOUNTANT_EXPORT_STATUSES = ['succeeded', 'partially_refunded', 'refunded', 'disputed'];

const COLUMNS = [
  'paid_date',
  'document_date',
  'document_type',
  'document_number',
  'document_link',
  'allocation_number',
  'no_document_reason',
  'payer',
  'business_name',
  'business_tax_id',
  'item',
  'pretax',
  'vat',
  'vat_rate',
  'total',
  'currency',
  'method',
  'provider',
  'payment_reason',
  'status',
  'refund_of_document',
  'payment_id',
] as const;

/** 11800 → "118.00"; -500 → "-5.00". */
export function formatMinorAmount(minor: number | null): string {
  if (minor === null) return '';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** ISO timestamp → DD/MM/YYYY in Israel time (how Israeli accountants read dates). */
export function formatIsraeliDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

export function buildAccountantCsv(
  rows: PaymentLogRow[],
  options: {
    tenant: { invoicing_provider?: string | null } | null | undefined;
    /** payment id → document number, for refunds whose original is outside the export. */
    originalDocumentNumbers?: Map<string, string | null>;
    t: TFunction;
  },
): string {
  const { tenant, t } = options;
  const numbers = new Map<string, string | null>(options.originalDocumentNumbers ?? []);
  for (const row of rows) numbers.set(row.id, row.external_document_number ?? null);

  const familyLabel = t('finance.payments.family_payment');
  const headers = COLUMNS.map((c) => t(`finance.accountant_export.col.${c}`));

  const body = rows.map((row) => {
    const doc = paymentDocumentStatus(row, tenant);
    const split = vatSplitFromDocument(
      row.total_amount_minor,
      doc.issued ? doc.kind : null,
      row.paid_at ?? row.created_at,
    );
    // "manual" lives under finance.provider; the rest under settings.provider_names.
    const providerName = t([`settings.provider_names.${row.provider}`, `finance.provider.${row.provider}`], {
      defaultValue: row.provider,
    });
    const documentType = doc.issued
      ? doc.kind
        ? t(`finance.accountant_export.document_kind.${doc.kind}`)
        : t('finance.accountant_export.document_kind.unknown', { provider: providerName })
      : '';
    const reason = doc.issued ? '' : t(`finance.accountant_export.no_document.${doc.reason}`);
    const refundOf = row.refunds_payment_id
      ? numbers.get(row.refunds_payment_id) ?? t('finance.accountant_export.refund_of_unknown')
      : '';

    return [
      formatIsraeliDate(row.paid_at),
      doc.issued ? formatIsraeliDate(row.invoice_issued_at ?? null) : '',
      documentType,
      doc.issued ? doc.number ?? '' : '',
      doc.issued ? doc.url ?? '' : '',
      row.allocation_number ?? '',
      reason,
      getPayerDisplay(row, familyLabel).label ?? '',
      row.billing_account?.business_name ?? '',
      row.billing_account?.business_tax_id ?? '',
      row.offering?.name ?? '',
      formatMinorAmount(split.pretaxMinor),
      formatMinorAmount(split.vatMinor),
      split.vatRate === null ? '' : `${Math.round(split.vatRate * 100)}%`,
      formatMinorAmount(split.totalMinor),
      row.currency,
      row.payment_method ? t(`finance.payment_method.${row.payment_method}`, { defaultValue: row.payment_method }) : '',
      providerName,
      t(`finance.charge_type.${row.charge_type}`, { defaultValue: row.charge_type }),
      t(`finance.payment_status.${row.status}`, { defaultValue: row.status }),
      refundOf,
      row.id,
    ];
  });

  return buildCsvContent(headers, body);
}
