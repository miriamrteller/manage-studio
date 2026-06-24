import { describe, it, expect } from 'vitest';
import {
  getJerusalemMonthRange,
  getJerusalemPreviousMonthRange,
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
});
