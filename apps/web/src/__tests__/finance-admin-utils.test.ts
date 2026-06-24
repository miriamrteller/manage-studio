import { describe, it, expect } from 'vitest';
import {
  buildCsvContent,
  receiptStoragePath,
  normalizeIsraeliTaxId,
  CSV_BOM,
} from '@/features/finance-admin/lib/financeAdminUtils';

describe('financeAdminUtils', () => {
  it('builds CSV with UTF-8 BOM and Hebrew cell', () => {
    const csv = buildCsvContent(['name'], [['שכירות']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('שכירות');
  });

  it('builds receipt storage path', () => {
    expect(receiptStoragePath('tenant-1', 'exp-1', 'pdf')).toBe('tenant-1/exp-1/receipt.pdf');
  });

  it('normalizes Israeli tax id to 9 digits', () => {
    expect(normalizeIsraeliTaxId('12-345-6789')).toBe('123456789');
    expect(normalizeIsraeliTaxId('12345')).toBeNull();
  });
});
