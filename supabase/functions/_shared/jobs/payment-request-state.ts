/**
 * Job payment request state machine — pure, deterministic, no I/O.
 *
 * Mirrors the BEFORE UPDATE trigger in
 * supabase/migrations/20261030000200_job_payment_requests.sql. Keep both in sync:
 * the trigger is the enforcement, this module is what the edge functions and
 * tests reason with before touching the row.
 *
 *   pending ──send──▶ sent ──pay──▶ paid ──manual refund──▶ refunded_manual
 *      │  ▲             │
 *      │  └──reopen─────┤
 *      ├──pay───────────┘ (manual cash/bank, or client paid an unsent link)
 *      └──cancel──▶ cancelled ──reopen──▶ pending
 */

export const JOB_PAYMENT_REQUEST_STATUSES = [
  "pending",
  "sent",
  "paid",
  "cancelled",
  "refunded_manual",
] as const;

export type JobPaymentRequestStatus = (typeof JOB_PAYMENT_REQUEST_STATUSES)[number];

export type JobPaymentRequestEvent =
  | "send_link"
  | "payment_succeeded"
  | "mark_paid_manual"
  | "cancel"
  | "reopen"
  | "refund_manual";

const TRANSITIONS: Record<JobPaymentRequestStatus, Partial<Record<JobPaymentRequestEvent, JobPaymentRequestStatus>>> = {
  pending: {
    send_link: "sent",
    payment_succeeded: "paid",
    mark_paid_manual: "paid",
    cancel: "cancelled",
  },
  sent: {
    // Re-sending keeps the row 'sent' (sent_at refreshes); modelled as a self-loop.
    send_link: "sent",
    payment_succeeded: "paid",
    mark_paid_manual: "paid",
    cancel: "cancelled",
    reopen: "pending",
  },
  paid: {
    refund_manual: "refunded_manual",
  },
  cancelled: {
    reopen: "pending",
  },
  refunded_manual: {},
};

export function isJobPaymentRequestStatus(value: unknown): value is JobPaymentRequestStatus {
  return typeof value === "string" &&
    (JOB_PAYMENT_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Next status for an event, or null when the transition is illegal. */
export function nextJobPaymentRequestStatus(
  current: JobPaymentRequestStatus,
  event: JobPaymentRequestEvent,
): JobPaymentRequestStatus | null {
  return TRANSITIONS[current][event] ?? null;
}

export function canTransition(
  current: JobPaymentRequestStatus,
  event: JobPaymentRequestEvent,
): boolean {
  return nextJobPaymentRequestStatus(current, event) !== null;
}

/** A charge may only be created while the request is still collectable. */
export function isCollectable(status: JobPaymentRequestStatus): boolean {
  return status === "pending" || status === "sent";
}

/** Counts toward "all paid" gating. refunded_manual does NOT — the money went back. */
export function isSettled(status: JobPaymentRequestStatus): boolean {
  return status === "paid";
}

/**
 * Gallery gating rule (pure mirror of job_payment_requests_all_paid()):
 * released when the admin released explicitly, or when at least one
 * non-cancelled request exists and every non-cancelled request is paid.
 */
export function isGalleryReleased(input: {
  releasedByAdminAt: string | null | undefined;
  requestStatuses: readonly JobPaymentRequestStatus[];
}): boolean {
  if (input.releasedByAdminAt) return true;
  const live = input.requestStatuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return false;
  return live.every(isSettled);
}

/** Outstanding (still collectable) amount for a job. */
export function outstandingMinor(
  requests: ReadonlyArray<{ status: JobPaymentRequestStatus; amount_minor: number }>,
): number {
  return requests.reduce(
    (sum, r) => (isCollectable(r.status) ? sum + r.amount_minor : sum),
    0,
  );
}
