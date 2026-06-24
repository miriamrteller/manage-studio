import type { TFunction } from 'i18next';
import type { PaymentLogRow, Expense } from '@shared/schemas';
import { buildCsvContent } from '../lib/financeAdminUtils';
import { getPayerDisplay } from '../lib/paymentsLogDisplay';

export function exportPaymentsCsv(
  rows: PaymentLogRow[],
  filename: string,
  t: TFunction,
): void {
  const headers = [
    'paid_date',
    'payer_name',
    'offering_title',
    'pretax_minor',
    'vat_minor',
    'total_minor',
    'currency',
    'status',
    'charge_type',
    'provider',
    'payment_method',
    'external_document_number',
    'engagement_id',
    'payment_id',
  ];

  const familyLabel = t('finance.payments.family_payment');
  const csvRows = rows.map((row) => {
    const payer = getPayerDisplay(row, familyLabel);
    return [
      row.paid_at?.slice(0, 10) ?? '',
      payer.label ?? '',
      row.offering?.name ?? '',
      String(row.pretax_amount_minor),
      String(row.vat_amount_minor),
      String(row.total_amount_minor),
      row.currency,
      row.status,
      row.charge_type,
      row.provider,
      row.payment_method ?? '',
      row.external_document_number ?? '',
      row.engagement_id ?? '',
      row.id,
    ];
  });

  downloadCsv(buildCsvContent(headers, csvRows), filename);
}

export function exportExpensesCsv(
  rows: Array<Expense & { category?: { name: string } | null }>,
  filename: string,
): void {
  const headers = [
    'expense_date',
    'category_name',
    'description',
    'pretax_minor',
    'vat_minor',
    'total_minor',
    'currency',
    'supplier_name',
    'supplier_vat_number',
    'corrects_expense_id',
    'expense_id',
  ];

  const csvRows = rows.map((row) => [
    row.expense_date,
    row.category?.name ?? '',
    row.description,
    String(row.pretax_amount_minor),
    String(row.vat_amount_minor),
    String(row.total_amount_minor),
    row.currency,
    row.supplier_name ?? '',
    row.supplier_vat_number ?? '',
    row.corrects_expense_id ?? '',
    row.id,
  ]);

  downloadCsv(buildCsvContent(headers, csvRows), filename);
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
