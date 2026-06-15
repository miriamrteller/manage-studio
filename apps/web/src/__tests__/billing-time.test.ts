import { describe, it, expect } from 'vitest';
import {
  dunningNextAttemptAt,
  firstOfNextMonthJerusalem,
  renewalIdempotencyKey,
} from '../../../../supabase/functions/_shared/payments/billing-time.ts';

describe('billing-time Jerusalem helpers', () => {
  it('builds renewal idempotency key per month', () => {
    expect(renewalIdempotencyKey('eng-1', '2026-06')).toBe('renewal-eng-1-2026-06');
  });

  it('schedules dunning Day 4 (+3d) then Day 8 (+4d)', () => {
    const from = new Date('2026-06-01T12:00:00.000Z');
    const day4 = new Date(dunningNextAttemptAt(1, from));
    const day8 = new Date(dunningNextAttemptAt(2, from));
    expect(day4.getUTCDate()).toBe(4);
    expect(day8.getUTCDate()).toBe(5);
  });

  it('returns first of next month date string', () => {
    const from = new Date('2026-05-15T12:00:00+03:00');
    expect(firstOfNextMonthJerusalem(from)).toMatch(/^2026-06-01$/);
  });
});
