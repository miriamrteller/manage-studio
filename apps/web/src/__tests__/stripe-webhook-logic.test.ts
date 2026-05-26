import { describe, it, expect } from 'vitest';

/**
 * Documents the post-payment state transitions performed by stripe-webhook.
 * Full webhook runs in Deno (service_role); this validates expected outcomes.
 */
export interface WebhookEnrolmentUpdate {
  status: 'active';
  payment_received_at: string;
}

export interface WebhookPaymentInsert {
  enrolment_id: string;
  person_id: string;
  status: 'succeeded';
  stripe_payment_intent_id: string;
}

export function buildPostPaymentEnrolmentUpdate(now: Date): WebhookEnrolmentUpdate {
  return {
    status: 'active',
    payment_received_at: now.toISOString(),
  };
}

export function buildWebhookPayment(params: {
  enrolmentId: string;
  personId: string;
  intentId: string;
  amountMinor: number;
}): WebhookPaymentInsert & { total_amount_minor: number } {
  return {
    enrolment_id: params.enrolmentId,
    person_id: params.personId,
    status: 'succeeded',
    stripe_payment_intent_id: params.intentId,
    total_amount_minor: params.amountMinor,
  };
}

export function isVisibleInParentPortal(enrolmentStatus: string): boolean {
  return enrolmentStatus === 'active' || enrolmentStatus === 'pending_payment';
}

describe('stripe webhook post-payment flow', () => {
  it('activates enrolment on payment_intent.succeeded', () => {
    const update = buildPostPaymentEnrolmentUpdate(new Date('2026-05-26T12:00:00Z'));
    expect(update.status).toBe('active');
    expect(update.payment_received_at).toBeTruthy();
  });

  it('records payment with enrolment and person ids', () => {
    const payment = buildWebhookPayment({
      enrolmentId: 'enrol-1',
      personId: 'person-1',
      intentId: 'pi_test',
      amountMinor: 24000,
    });

    expect(payment.status).toBe('succeeded');
    expect(payment.enrolment_id).toBe('enrol-1');
    expect(payment.total_amount_minor).toBe(24000);
  });

  it('shows active enrolments in parent portal', () => {
    expect(isVisibleInParentPortal('active')).toBe(true);
    expect(isVisibleInParentPortal('pending_payment')).toBe(true);
    expect(isVisibleInParentPortal('cancelled')).toBe(false);
  });
});
