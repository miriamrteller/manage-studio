export type PendingEnrolmentActionKind = 'complete_payment' | 'complete_waiver';

export interface PendingEnrolmentAction {
  kind: PendingEnrolmentActionKind;
  path: string;
}

const PENDING_ACTION_STATUSES = ['pending_payment', 'pending_waiver'] as const;

export type PendingActionEnrolmentStatus = (typeof PENDING_ACTION_STATUSES)[number];

export function isPendingEnrolmentActionStatus(
  status: string,
): status is PendingActionEnrolmentStatus {
  return (PENDING_ACTION_STATUSES as readonly string[]).includes(status);
}

/** Route parents (and authenticated staff) to the correct completion step. */
export function resolvePendingEnrolmentAction(
  status: string,
  engagementId: string,
): PendingEnrolmentAction | null {
  if (status === 'pending_payment') {
    return {
      kind: 'complete_payment',
      path: `/enrol/pay/${encodeURIComponent(engagementId)}`,
    };
  }
  if (status === 'pending_waiver') {
    return {
      kind: 'complete_waiver',
      path: `/enrol/complete?engagementId=${encodeURIComponent(engagementId)}`,
    };
  }
  return null;
}

export function pendingEnrolmentActionLabelKey(
  kind: PendingEnrolmentActionKind,
): 'enrolment.pending_action.complete_payment' | 'enrolment.pending_action.complete_waiver' {
  return kind === 'complete_payment'
    ? 'enrolment.pending_action.complete_payment'
    : 'enrolment.pending_action.complete_waiver';
}
