import { describe, expect, it } from 'vitest';
import {
  isLateCancellation,
  resolveAppointmentPenalty,
} from '@/features/scheduling/lib/resolveAppointmentPenalty';

const START = '2026-07-20T12:00:00.000Z';

describe('isLateCancellation', () => {
  it('is false when well before the window', () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z'); // 24h before
    expect(isLateCancellation(START, 12, now)).toBe(false);
  });

  it('is true inside the late-cancel window', () => {
    const now = Date.parse('2026-07-20T06:00:00.000Z'); // 6h before
    expect(isLateCancellation(START, 12, now)).toBe(true);
  });

  it('is true after the appointment has started', () => {
    const now = Date.parse('2026-07-20T13:00:00.000Z');
    expect(isLateCancellation(START, 24, now)).toBe(true);
  });
});

describe('resolveAppointmentPenalty', () => {
  const base = {
    bookedStartsAt: START,
    lateCancelHours: 24,
    retainPaymentOnPenalty: true,
    wasPaid: true,
    nowMs: Date.parse('2026-07-20T06:00:00.000Z'),
  };

  it('marks no-show with penalty when paid and retain on', () => {
    const r = resolveAppointmentPenalty({ ...base, action: 'no_show' });
    expect(r.cancellation_reason).toBe('no_show');
    expect(r.penalty_applied_at).toBe(new Date(base.nowMs).toISOString());
  });

  it('marks no-show without penalty when unpaid', () => {
    const r = resolveAppointmentPenalty({
      ...base,
      action: 'no_show',
      wasPaid: false,
    });
    expect(r.cancellation_reason).toBe('no_show');
    expect(r.penalty_applied_at).toBeNull();
  });

  it('uses late_cancellation inside the window', () => {
    const r = resolveAppointmentPenalty({ ...base, action: 'cancel' });
    expect(r.cancellation_reason).toBe('late_cancellation');
    expect(r.penalty_applied_at).not.toBeNull();
  });

  it('uses admin_cancelled outside the window', () => {
    const r = resolveAppointmentPenalty({
      ...base,
      action: 'cancel',
      nowMs: Date.parse('2026-07-18T12:00:00.000Z'),
    });
    expect(r.cancellation_reason).toBe('admin_cancelled');
    expect(r.penalty_applied_at).toBeNull();
  });

  it('skips penalty_applied_at when retain is off', () => {
    const r = resolveAppointmentPenalty({
      ...base,
      action: 'cancel',
      retainPaymentOnPenalty: false,
    });
    expect(r.cancellation_reason).toBe('late_cancellation');
    expect(r.penalty_applied_at).toBeNull();
  });
});
