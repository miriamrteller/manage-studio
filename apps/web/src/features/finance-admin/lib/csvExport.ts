import type { TFunction } from 'i18next';
import type { PaymentLogRow, Expense } from '@shared/schemas';
import { buildCsvContent } from '../lib/financeAdminUtils';
import { getPayerDisplay } from '../lib/paymentsLogDisplay';
import { formatIsraeliDate, formatMinorAmount } from './accountantExport';
import { expenseCategoryName, type ExpenseCatalogNames } from './expenseCategoryName';

/** YYYY-MM-DD (a calendar date) → DD/MM/YYYY. */
function israeliDay(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}

/**
 * Payments log CSV. `t` is fixed to the file's language (csvT), so headers and labels follow
 * the language chosen for the file; dates are DD/MM/YYYY and amounts plain numbers in both.
 */
export function buildPaymentsCsv(rows: PaymentLogRow[], t: TFunction): string {
  const col = (key: string) => t(`finance.accountant_export.col.${key}`);
  const headers = [
    col('paid_date'),
    col('payer'),
    col('item'),
    col('total'),
    col('currency'),
    col('status'),
    col('payment_reason'),
    col('provider'),
    col('method'),
    col('document_number'),
    t('finance.csv.enrolment_id'),
    col('payment_id'),
  ];

  const familyLabel = t('finance.payments.family_payment');
  const csvRows = rows.map((row) => {
    const payer = getPayerDisplay(row, familyLabel);
    return [
      formatIsraeliDate(row.paid_at),
      payer.label ?? '',
      row.offering?.name ?? '',
      formatMinorAmount(row.total_amount_minor),
      row.currency,
      t(`finance.payment_status.${row.status}`, { defaultValue: row.status }),
      t(`finance.charge_type.${row.charge_type}`, { defaultValue: row.charge_type }),
      t([`settings.provider_names.${row.provider}`, `finance.provider.${row.provider}`], {
        defaultValue: row.provider,
      }),
      row.payment_method
        ? t(`finance.payment_method.${row.payment_method}`, { defaultValue: row.payment_method })
        : '',
      row.external_document_number ?? '',
      row.engagement_id ?? '',
      row.id,
    ];
  });

  return buildCsvContent(headers, csvRows);
}

export function exportPaymentsCsv(rows: PaymentLogRow[], filename: string, t: TFunction): void {
  downloadCsv(buildPaymentsCsv(rows, t), filename);
}

/** Expenses CSV in the file's language (see buildPaymentsCsv). */
export function buildExpensesCsv(
  rows: Array<Expense & { category?: { name: string; catalog?: ExpenseCatalogNames | null } | null }>,
  t: TFunction,
): string {
  const col = (key: string) => t(`finance.csv.expenses.${key}`);
  const headers = [
    col('expense_date'),
    col('category'),
    col('description'),
    t('finance.accountant_export.col.pretax'),
    t('finance.accountant_export.col.vat'),
    t('finance.accountant_export.col.total'),
    t('finance.accountant_export.col.currency'),
    col('supplier_name'),
    col('supplier_vat_number'),
    col('corrects_expense_id'),
    col('expense_id'),
  ];

  const csvRows = rows.map((row) => [
    israeliDay(row.expense_date),
    expenseCategoryName(row.category, t('finance.csv.lang_code') === 'he' ? 'he' : 'en'),
    row.description,
    formatMinorAmount(row.pretax_amount_minor),
    formatMinorAmount(row.vat_amount_minor),
    formatMinorAmount(row.total_amount_minor),
    row.currency,
    row.supplier_name ?? '',
    row.supplier_vat_number ?? '',
    row.corrects_expense_id ?? '',
    row.id,
  ]);

  return buildCsvContent(headers, csvRows);
}

export function exportExpensesCsv(
  rows: Array<Expense & { category?: { name: string; catalog?: ExpenseCatalogNames | null } | null }>,
  filename: string,
  t: TFunction,
): void {
  downloadCsv(buildExpensesCsv(rows, t), filename);
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
