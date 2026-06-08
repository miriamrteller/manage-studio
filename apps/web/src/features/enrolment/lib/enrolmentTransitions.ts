import type { Engagement } from '@shared/schemas';

export const CANCELLABLE_PRE_PAYMENT_STATUSES = [
  'pending_payment',
  'admin_review',
  'pending_offer',
] as const;

export const NON_TERMINAL_ENGAGEMENT_STATUSES = [
  ...CANCELLABLE_PRE_PAYMENT_STATUSES,
  'active',
] as const;

export type EngagementStatus = Engagement['status'];

export type CancelPrePaymentResult =
  | { allowed: true }
  | { allowed: false; code: 'has_payment' | 'invalid_status' };

export function canCancelPrePaymentEnrolment(input: {
  status: EngagementStatus;
  paymentReceivedAt: string | null | undefined;
  hasSucceededPayment: boolean;
}): CancelPrePaymentResult {
  if (input.paymentReceivedAt != null || input.hasSucceededPayment) {
    return { allowed: false, code: 'has_payment' };
  }

  switch (input.status) {
    case 'pending_payment':
    case 'admin_review':
    case 'pending_offer':
      return { allowed: true };
    case 'active':
    case 'cancelled':
    case 'withdrawn':
    case 'pending_waiver':
      return { allowed: false, code: 'invalid_status' };
    default: {
      const _exhaustive: never = input.status;
      void _exhaustive;
      return { allowed: false, code: 'invalid_status' };
    }
  }
}

export function mapCancelEnrolmentError(message: string): 'has_payment' | 'invalid_status' | 'generic' {
  const lower = message.toLowerCase();
  if (lower.includes('payment')) {
    return 'has_payment';
  }
  if (lower.includes('cannot be cancelled') || lower.includes('status')) {
    return 'invalid_status';
  }
  return 'generic';
}
