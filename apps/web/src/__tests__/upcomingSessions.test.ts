import { describe, it, expect } from 'vitest';
import {
  nextOccurrenceOnOrAfter,
  buildUpcomingSessions,
} from '@/features/enrolment/lib/upcomingSessions';
import type { EngagementWithOffering } from '@/components/Dashboard/useParentPortal';

function makeEnrolment(overrides: Partial<EngagementWithOffering> & Pick<EngagementWithOffering, 'id' | 'person_id' | 'status'>): EngagementWithOffering {
  return {
    tenant_id: 'tenant-1',
    offering_id: 'offering-1',
    season_id: null,
    created_at: '2026-01-01T00:00:00Z',
    className: 'Ballet Beginners',
    classDay: 1,
    classStartTime: '18:00',
    classLocation: 'Studio A',
    ...overrides,
  };
}

describe('nextOccurrenceOnOrAfter', () => {
  it('includes today when class day matches and start time is later today', () => {
    const fromDate = new Date(2025, 0, 6, 14, 0); // Mon Jan 6 2025 14:00
    const result = nextOccurrenceOnOrAfter(1, '18:00', fromDate);
    expect(result).toEqual(new Date(2025, 0, 6, 18, 0));
  });

  it('excludes next week when today is class day but start time already passed', () => {
    const fromDate = new Date(2025, 0, 6, 15, 0); // Mon Jan 6 2025 15:00
    const result = nextOccurrenceOnOrAfter(1, '10:00', fromDate);
    expect(result).toBeNull();
  });

  it('finds next Monday within horizon when today is Thursday', () => {
    const fromDate = new Date(2025, 0, 9, 9, 0); // Thu Jan 9 2025
    const result = nextOccurrenceOnOrAfter(1, '10:00', fromDate);
    expect(result).toEqual(new Date(2025, 0, 13, 10, 0)); // Mon Jan 13
  });
});

describe('buildUpcomingSessions', () => {
  const fromDate = new Date(2025, 0, 6, 14, 0); // Mon Jan 6 2025 14:00

  it('excludes cancelled enrolments', () => {
    const enrolmentsByPerson = {
      'person-1': [
        makeEnrolment({ id: 'e1', person_id: 'person-1', status: 'cancelled' }),
      ],
    };
    const sessions = buildUpcomingSessions(enrolmentsByPerson, { 'person-1': 'Alice' }, { fromDate });
    expect(sessions).toHaveLength(0);
  });

  it('excludes enrolments missing schedule fields', () => {
    const enrolmentsByPerson = {
      'person-1': [
        makeEnrolment({ id: 'e1', person_id: 'person-1', status: 'active', classDay: null }),
        makeEnrolment({ id: 'e2', person_id: 'person-1', status: 'active', classStartTime: null }),
      ],
    };
    const sessions = buildUpcomingSessions(enrolmentsByPerson, { 'person-1': 'Alice' }, { fromDate });
    expect(sessions).toHaveLength(0);
  });

  it('returns active enrolments sorted by occursAt', () => {
    const enrolmentsByPerson = {
      'person-1': [
        makeEnrolment({
          id: 'e1',
          person_id: 'person-1',
          status: 'active',
          classDay: 3,
          classStartTime: '09:00',
          className: 'Wednesday Class',
        }),
        makeEnrolment({
          id: 'e2',
          person_id: 'person-1',
          status: 'pending_payment',
          classDay: 1,
          classStartTime: '18:00',
          className: 'Monday Class',
        }),
      ],
    };
    const sessions = buildUpcomingSessions(enrolmentsByPerson, { 'person-1': 'Alice' }, { fromDate });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].engagementId).toBe('e2');
    expect(sessions[1].engagementId).toBe('e1');
    expect(sessions[0].personName).toBe('Alice');
  });
});
