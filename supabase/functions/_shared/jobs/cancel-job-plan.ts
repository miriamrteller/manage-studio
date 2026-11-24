/**
 * What cancelling a shoot does to its payment requests — pure, no I/O.
 * Covered by apps/web/src/__tests__/cancel-job-plan.test.ts.
 *
 * Open requests (pending / sent) are cancelled so their pay links and
 * reminders stop. Paid money is left alone: the studio decides whether to
 * refund, using Refund on the payment.
 */
import { isCollectable, type JobPaymentRequestStatus } from "./payment-request-state.ts";

export interface CancelPlanRequest {
  id: string;
  status: JobPaymentRequestStatus;
  amount_minor: number;
}

export interface CancelPlan {
  cancelRequestIds: string[];
  paidMinor: number;
}

export function planJobCancellation(requests: readonly CancelPlanRequest[]): CancelPlan {
  return {
    cancelRequestIds: requests.filter((r) => isCollectable(r.status)).map((r) => r.id),
    paidMinor: requests.filter((r) => r.status === "paid").reduce((sum, r) => sum + r.amount_minor, 0),
  };
}
