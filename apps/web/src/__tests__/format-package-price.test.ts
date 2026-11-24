import { describe, expect, it } from 'vitest';
import i18n from '@/i18n/i18n';
import { formatPackagePrice } from '@/lib/formatPackagePrice';

describe('formatPackagePrice', () => {
  const en = i18n.getFixedT('en');
  const he = i18n.getFixedT('he');

  it('shows the price, "From" the price, or "Price on request"', () => {
    expect(formatPackagePrice(en, 150000, 'show', 'ILS', 'en')).toContain('1,500');
    expect(formatPackagePrice(en, 150000, 'from', 'ILS', 'en')).toMatch(/^From .*1,500/);
    expect(formatPackagePrice(en, null, 'on_request', 'ILS', 'en')).toBe('Price on request');
    expect(formatPackagePrice(he, 150000, 'from', 'ILS', 'he')).toMatch(/^החל מ־/);
    expect(formatPackagePrice(he, null, 'on_request', 'ILS', 'he')).toBe('מחיר לפי בקשה');
  });

  it('shows nothing for a missing or zero price', () => {
    expect(formatPackagePrice(en, 0, 'show', 'ILS', 'en')).toBeNull();
    expect(formatPackagePrice(en, null, 'from', 'ILS', 'en')).toBeNull();
  });
});
