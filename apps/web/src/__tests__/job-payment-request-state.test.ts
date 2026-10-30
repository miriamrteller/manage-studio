/**
 * Photographer beta B: request state transitions, gallery gating rule,
 * deposit/balance split and reminder scheduling are pure and deterministic.
 * Run: pnpm -C apps/web test job-payment-request-state.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  isCollectable,
  isGalleryReleased,
  nextJobPaymentRequestStatus,
  outstandingMinor,
  JOB_PAYMENT_REQUEST_STATUSES,
  type JobPaymentRequestEvent,
  type JobPaymentRequestStatus,
} from '../../../../supabase/functions/_shared/jobs/payment-request-state.ts';
import {
  decideReminder,
  DUE_SOON_DAYS,
} from '../../../../supabase/functions/_shared/jobs/apply-request-reminder-step.ts';
import { splitDepositBalance, isoDateMinusDays } from '@shared/jobPayments';

describe('job payment request transitions', () => {
  it('pending → sent → paid → refunded_manual is the happy path', () => {
    expect(nextJobPaymentRequestStatus('pending', 'send_link')).toBe('sent');
    expect(nextJobPaymentRequestStatus('sent', 'payment_succeeded')).toBe('paid');
    expect(nextJobPaymentRequestStatus('paid', 'refund_manual')).toBe('refunded_manual');
  });

  it('an unsent request can still be paid (client got the link elsewhere, or cash)', () => {
    expect(nextJobPaymentRequestStatus('pending', 'payment_succeeded')).toBe('paid');
    expect(nextJobPaymentRequestStatus('pending', 'mark_paid_manual')).toBe('paid');
  });

  it('paid and refunded requests never collect again', () => {
    const events: JobPaymentRequestEvent[] = ['send_link', 'payment_succeeded', 'mark_paid_manual', 'cancel', 'reopen'];
    for (const e of events) {
      expect(canTransition('paid', e)).toBe(false);
      expect(canTransition('refunded_manual', e)).toBe(false);
    }
    expect(canTransition('refunded_manual', 'refund_manual')).toBe(false);
  });

  it('cancelled can only be reopened', () => {
    expect(nextJobPaymentRequestStatus('cancelled', 'reopen')).toBe('pending');
    expect(canTransition('cancelled', 'payment_succeeded')).toBe(false);
    expect(canTransition('cancelled', 'send_link')).toBe(false);
  });

  it('only pending/sent are collectable', () => {
    const collectable = JOB_PAYMENT_REQUEST_STATUSES.filter(isCollectable);
    expect(collectable).toEqual(['pending', 'sent']);
  });

  it('every status has a defined transition table (no holes)', () => {
    for (const s of JOB_PAYMENT_REQUEST_STATUSES) {
      expect(() => nextJobPaymentRequestStatus(s, 'cancel')).not.toThrow();
    }
  });
});

describe('gallery gating', () => {
  const statuses = (...s: JobPaymentRequestStatus[]) => s;

  it('is locked while any non-cancelled request is unpaid', () => {
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: statuses('paid', 'sent') })).toBe(false);
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: statuses('paid', 'pending') })).toBe(false);
  });

  it('opens once every non-cancelled request is paid', () => {
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: statuses('paid', 'paid', 'cancelled') })).toBe(true);
  });

  it('a refunded request re-locks the gallery', () => {
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: statuses('paid', 'refunded_manual') })).toBe(false);
  });

  it('no requests at all is NOT released (admin must release explicitly)', () => {
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: [] })).toBe(false);
    expect(isGalleryReleased({ releasedByAdminAt: null, requestStatuses: statuses('cancelled') })).toBe(false);
  });

  it('admin release overrides everything', () => {
    expect(isGalleryReleased({ releasedByAdminAt: '2026-10-30T10:00:00Z', requestStatuses: statuses('pending') })).toBe(true);
    expect(isGalleryReleased({ releasedByAdminAt: '2026-10-30T10:00:00Z', requestStatuses: [] })).toBe(true);
  });

  it('outstanding sums only collectable requests', () => {
    expect(
      outstandingMinor([
        { status: 'pending', amount_minor: 15000 },
        { status: 'sent', amount_minor: 35000 },
        { status: 'paid', amount_minor: 99999 },
        { status: 'cancelled', amount_minor: 1 },
      ]),
    ).toBe(50000);
  });
});

describe('deposit + balance split', () => {
  it('sums exactly to the total and rounds the deposit to whole shekels', () => {
    const { depositMinor, balanceMinor } = splitDepositBalance(45000, 30);
    expect(depositMinor).toBe(13500);
    expect(depositMinor + balanceMinor).toBe(45000);
  });

  it('rounds awkward percentages without losing an agora', () => {
    const total = 123457;
    const { depositMinor, balanceMinor } = splitDepositBalance(total, 33);
    expect(depositMinor % 100).toBe(0);
    expect(depositMinor + balanceMinor).toBe(total);
    expect(balanceMinor).toBeGreaterThan(0);
  });

  it('rejects invalid inputs', () => {
    expect(() => splitDepositBalance(0, 30)).toThrow();
    expect(() => splitDepositBalance(1000, 0)).toThrow();
    expect(() => splitDepositBalance(1000, 100)).toThrow();
    expect(() => splitDepositBalance(10.5, 30)).toThrow();
  });

  it('isoDateMinusDays stays in calendar days', () => {
    expect(isoDateMinusDays('2026-11-10', 7)).toBe('2026-11-03');
    expect(isoDateMinusDays('2026-03-01', 1)).toBe('2026-02-28');
  });
});

describe('balance reminder scheduling', () => {
  const base = { status: 'sent' as const, due_reminder_sent_at: null, overdue_reminder_sent_at: null };

  it(`sends the due-soon link ${DUE_SOON_DAYS} days before the due date, once`, () => {
    expect(decideReminder({ ...base, due_date: '2026-11-10' }, '2026-11-06')).toBeNull();
    expect(decideReminder({ ...base, due_date: '2026-11-10' }, '2026-11-07')).toBe('due_soon');
    expect(decideReminder({ ...base, due_date: '2026-11-10' }, '2026-11-10')).toBe('due_soon');
    expect(decideReminder({ ...base, due_date: '2026-11-10', due_reminder_sent_at: 'x' }, '2026-11-08')).toBeNull();
  });

  it('sends one overdue reminder after the grace day', () => {
    expect(decideReminder({ ...base, due_date: '2026-11-10' }, '2026-11-11')).toBe('overdue');
    expect(decideReminder({ ...base, due_date: '2026-11-10', overdue_reminder_sent_at: 'x' }, '2026-11-20')).toBeNull();
  });

  it('never reminds for paid, cancelled or undated requests', () => {
    expect(decideReminder({ ...base, status: 'paid', due_date: '2026-11-10' }, '2026-11-12')).toBeNull();
    expect(decideReminder({ ...base, status: 'cancelled', due_date: '2026-11-10' }, '2026-11-12')).toBeNull();
    expect(decideReminder({ ...base, due_date: null }, '2026-11-12')).toBeNull();
  });
});
