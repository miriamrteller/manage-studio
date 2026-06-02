import { describe, it, expect } from 'vitest';
import {
  canCancelPrePaymentEnrolment,
  mapCancelEnrolmentError,
} from '@/features/enrolment/lib/enrolmentTransitions';

describe('canCancelPrePaymentEnrolment', () => {
  it('allows pending_payment, admin_review, pending_offer', () => {
    for (const status of ['pending_payment', 'admin_review', 'pending_offer'] as const) {
      expect(
        canCancelPrePaymentEnrolment({
          status,
          paymentReceivedAt: null,
          hasSucceededPayment: false,
        }),
      ).toEqual({ allowed: true });
    }
  });

  it('rejects active, cancelled, withdrawn', () => {
    for (const status of ['active', 'cancelled', 'withdrawn'] as const) {
      expect(
        canCancelPrePaymentEnrolment({
          status,
          paymentReceivedAt: null,
          hasSucceededPayment: false,
        }),
      ).toEqual({ allowed: false, code: 'invalid_status' });
    }
  });

  it('rejects when payment_received_at is set', () => {
    expect(
      canCancelPrePaymentEnrolment({
        status: 'pending_payment',
        paymentReceivedAt: '2026-01-01T00:00:00Z',
        hasSucceededPayment: false,
      }),
    ).toEqual({ allowed: false, code: 'has_payment' });
  });

  it('rejects when a succeeded payment exists', () => {
    expect(
      canCancelPrePaymentEnrolment({
        status: 'pending_payment',
        paymentReceivedAt: null,
        hasSucceededPayment: true,
      }),
    ).toEqual({ allowed: false, code: 'has_payment' });
  });
});

describe('mapCancelEnrolmentError', () => {
  it('maps payment errors', () => {
    expect(mapCancelEnrolmentError('Engagement already has payment recorded')).toBe('has_payment');
  });

  it('maps status errors', () => {
    expect(mapCancelEnrolmentError('Engagement cannot be cancelled from status active')).toBe(
      'invalid_status',
    );
  });
});
