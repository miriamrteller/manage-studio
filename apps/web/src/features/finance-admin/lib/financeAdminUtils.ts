import { TIMEZONE } from '@/lib/constants';

export const CSV_BOM = '\uFEFF';

export const CSV_EXPORT_MAX_ROWS = 5000;

/** e.g. payments-creativeballet-2026-06-28.csv */
export function datedCsvFilename(prefix: string, subdomain: string, at: Date = new Date()): string {
  const date = at.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  return `${prefix}-${subdomain}-${date}.csv`;
}

export function buildCsvContent(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    if (/[",\n\r]/.test(cell)) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map((cell) => escape(cell)).join(',')),
  ];
  return CSV_BOM + lines.join('\r\n');
}

export function receiptStoragePath(
  tenantId: string,
  expenseId: string,
  extension: string,
): string {
  const ext = extension.replace(/^\./, '').toLowerCase();
  return `${tenantId}/${expenseId}/receipt.${ext}`;
}

export function normalizeIsraeliTaxId(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return null;
  return digits;
}
