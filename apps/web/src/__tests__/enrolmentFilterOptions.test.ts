import { describe, expect, it } from 'vitest';
import { filterEnrolmentsByStatus } from '@/features/enrolment/lib/enrolmentFilterOptions';

describe('filterEnrolmentsByStatus', () => {
  const enrolments = [
    { id: '1', status: 'pending_payment' as const },
    { id: '2', status: 'active' as const },
    { id: '3', status: 'pending_waiver' as const },
  ];

  it('returns all enrolments when no status filter is selected', () => {
    expect(filterEnrolmentsByStatus(enrolments, [])).toEqual(enrolments);
  });

  it('filters to pending payment and waiver statuses', () => {
    expect(filterEnrolmentsByStatus(enrolments, ['pending_payment', 'pending_waiver'])).toEqual([
      enrolments[0],
      enrolments[2],
    ]);
  });
});
