import { describe, it, expect } from 'vitest';
import {
  ENROLMENT_DUNNING_DAY_OFFSETS,
  enrolmentDunningActionDueAt,
  enrolmentDunningNextActionAt,
  jerusalemCalendarDaysSinceCreated,
  jerusalemMidnightIso,
  resolveEnrolmentDunningDueAttempt,
} from '../../../../supabase/functions/_shared/collections/enrolment-dunning-time.ts';

describe('enrolment-dunning-time', () => {
  it('exports Day 3/7/14 offsets', () => {
    expect(ENROLMENT_DUNNING_DAY_OFFSETS).toEqual([3, 7, 14]);
  });

  it('schedules attempt due times from Jerusalem created_at', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    expect(enrolmentDunningActionDueAt(createdAt, 1)).toBe(
      jerusalemMidnightIso('2026-06-04'),
    );
    expect(enrolmentDunningActionDueAt(createdAt, 2)).toBe(
      jerusalemMidnightIso('2026-06-08'),
    );
    expect(enrolmentDunningActionDueAt(createdAt, 3)).toBe(
      jerusalemMidnightIso('2026-06-15'),
    );
  });

  it('returns next action after completing an attempt', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    expect(enrolmentDunningNextActionAt(createdAt, 1)).toBe(
      enrolmentDunningActionDueAt(createdAt, 2),
    );
    expect(enrolmentDunningNextActionAt(createdAt, 2)).toBe(
      enrolmentDunningActionDueAt(createdAt, 3),
    );
    expect(enrolmentDunningNextActionAt(createdAt, 3)).toBeNull();
  });

  it('counts Jerusalem calendar days since created_at', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    const day3 = new Date(enrolmentDunningActionDueAt(createdAt, 1));
    expect(jerusalemCalendarDaysSinceCreated(createdAt, day3)).toBe(3);
  });

  it('catch-up: day 14 with count 0 resolves to attempt 3 (cancel)', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    const day14 = new Date(enrolmentDunningActionDueAt(createdAt, 3));
    expect(resolveEnrolmentDunningDueAttempt(createdAt, 0, day14)).toBe(3);
  });

  it('returns attempt 1 on day 3 with count 0', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    const day3 = new Date(enrolmentDunningActionDueAt(createdAt, 1));
    expect(resolveEnrolmentDunningDueAttempt(createdAt, 0, day3)).toBe(1);
  });

  it('returns null before day 3', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    const day2 = new Date('2026-06-02T21:00:00.000Z');
    expect(resolveEnrolmentDunningDueAttempt(createdAt, 0, day2)).toBeNull();
  });

  it('count=1 cannot jump to cancel before day 14', () => {
    const createdAt = '2026-06-01T10:00:00.000Z';
    const day7 = new Date(enrolmentDunningActionDueAt(createdAt, 2));
    expect(resolveEnrolmentDunningDueAttempt(createdAt, 1, day7)).toBe(2);
    expect(resolveEnrolmentDunningDueAttempt(createdAt, 1, day7)).not.toBe(3);
  });
});
