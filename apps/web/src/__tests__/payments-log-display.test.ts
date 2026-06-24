import { describe, it, expect } from 'vitest';
import {
  getPayerDisplay,
  isRefundRow,
  shouldIncludeInPaidDateFilter,
} from '@/features/finance-admin/lib/paymentsLogDisplay';

describe('paymentsLogDisplay', () => {
  it('shows person name when person_id set', () => {
    const display = getPayerDisplay(
      { person_id: 'p1', account_id: null, person: { id: 'p1', name: 'Ruti' } },
      'Family payment',
    );
    expect(display).toEqual({ kind: 'person', label: 'Ruti' });
  });

  it('shows family label when only account_id set', () => {
    const display = getPayerDisplay(
      { person_id: null, account_id: 'a1', person: null },
      'Family payment',
    );
    expect(display).toEqual({ kind: 'family', label: 'Family payment' });
  });

  it('detects refund rows', () => {
    expect(isRefundRow({ charge_type: 'refund', total_amount_minor: -100 })).toBe(true);
    expect(isRefundRow({ charge_type: 'initial', total_amount_minor: 100 })).toBe(false);
  });

  it('excludes pending rows when date filter active', () => {
    expect(shouldIncludeInPaidDateFilter(null, '2026-06-01', '2026-06-30')).toBe(false);
    expect(shouldIncludeInPaidDateFilter('2026-06-10T10:00:00Z', '2026-06-01', '2026-06-30')).toBe(true);
    expect(shouldIncludeInPaidDateFilter('2026-05-10T10:00:00Z', '2026-06-01', '2026-06-30')).toBe(false);
  });

  it('includes all rows when no date filter', () => {
    expect(shouldIncludeInPaidDateFilter(null, null, null)).toBe(true);
  });
});
