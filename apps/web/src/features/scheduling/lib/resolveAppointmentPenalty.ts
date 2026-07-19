export type AppointmentCloseAction = 'cancel' | 'no_show';

export type AppointmentCancellationReason =
  | 'admin_cancelled'
  | 'late_cancellation'
  | 'no_show';

export interface ResolveAppointmentPenaltyInput {
  action: AppointmentCloseAction;
  /** ISO timestamptz of the appointment start */
  bookedStartsAt: string;
  /** Hours before start that count as late cancel */
  lateCancelHours: number;
  retainPaymentOnPenalty: boolean;
  /** True when payment_received_at is set (or equivalent paid status) */
  wasPaid: boolean;
  /** Injected for tests; defaults to Date.now() */
  nowMs?: number;
}

export interface ResolveAppointmentPenaltyResult {
  cancellation_reason: AppointmentCancellationReason;
  penalty_applied_at: string | null;
}

/** True when `now` is within `lateCancelHours` before `bookedStartsAt` (or after start). */
export function isLateCancellation(
  bookedStartsAt: string,
  lateCancelHours: number,
  nowMs: number = Date.now(),
): boolean {
  const startMs = new Date(bookedStartsAt).getTime();
  if (Number.isNaN(startMs)) return false;
  const windowMs = Math.max(0, lateCancelHours) * 60 * 60 * 1000;
  return nowMs >= startMs - windowMs;
}

/**
 * Resolve cancellation_reason + whether payment is retained as penalty.
 * Does not call payment providers — recording only.
 */
export function resolveAppointmentPenalty(
  input: ResolveAppointmentPenaltyInput,
): ResolveAppointmentPenaltyResult {
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (input.action === 'no_show') {
    return {
      cancellation_reason: 'no_show',
      penalty_applied_at:
        input.retainPaymentOnPenalty && input.wasPaid ? nowIso : null,
    };
  }

  if (isLateCancellation(input.bookedStartsAt, input.lateCancelHours, nowMs)) {
    return {
      cancellation_reason: 'late_cancellation',
      penalty_applied_at:
        input.retainPaymentOnPenalty && input.wasPaid ? nowIso : null,
    };
  }

  return {
    cancellation_reason: 'admin_cancelled',
    penalty_applied_at: null,
  };
}
