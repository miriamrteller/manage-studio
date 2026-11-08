import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getJerusalemMonthRange,
  getJerusalemPreviousMonthRange,
  parseFinancePeriodKey,
  resolvePeriodDateRange,
} from '@/features/finance-admin/lib/periods';

describe('finance periods', () => {
  it('returns full June 2026 for a mid-June reference', () => {
    const range = getJerusalemMonthRange(new Date('2026-06-15T12:00:00Z'));
    expect(range.startDate).toBe('2026-06-01');
    expect(range.endDate).toBe('2026-06-30');
  });

  it('returns May 2026 for previous month from June reference', () => {
    const range = getJerusalemPreviousMonthRange(new Date('2026-06-15T12:00:00Z'));
    expect(range.startDate).toBe('2026-05-01');
    expect(range.endDate).toBe('2026-05-31');
  });

  describe('this year and last year', () => {
    afterEach(() => vi.useRealTimers());

    it('covers the Jerusalem calendar year', () => {
      vi.useFakeTimers();
      // 31 Dec 23:30 UTC is already 1 January in Jerusalem.
      vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
      expect(resolvePeriodDateRange('year_current')).toEqual({ startDate: '2027-01-01', endDate: '2027-12-31' });
      expect(resolvePeriodDateRange('year_previous')).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
    });

    it('reads the year periods from the address', () => {
      expect(parseFinancePeriodKey('year_current')).toBe('year_current');
      expect(parseFinancePeriodKey('year_previous')).toBe('year_previous');
      expect(parseFinancePeriodKey('nonsense')).toBe('month_current');
    });
  });
});
