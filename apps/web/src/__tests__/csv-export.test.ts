import { describe, it, expect } from 'vitest';
import { buildCsvContent, CSV_BOM } from '@/features/finance-admin/lib/financeAdminUtils';

describe('csv-export', () => {
  it('includes UTF-8 BOM prefix', () => {
    const content = buildCsvContent(['name'], [['שכירות']]);
    expect(content.startsWith(CSV_BOM)).toBe(true);
  });

  it('preserves Hebrew cell content', () => {
    const content = buildCsvContent(['category'], [['שכירות']]);
    expect(content).toContain('שכירות');
  });
});
