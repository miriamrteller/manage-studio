/**
 * Pure refund arithmetic shared by process-refund (and its tests). A refund may be partial:
 * any amount above 0 and up to what is left; no amount means "what is left".
 */
export type RefundPlan =
  | { ok: true; amountMinor: number; newRefundTotal: number; newStatus: "refunded" | "partially_refunded"; releasesJobRequest: boolean }
  | { ok: false };

export function planRefund(input: {
  totalMinor: number;
  alreadyRefundedMinor: number | null | undefined;
  requestedMinor?: number;
}): RefundPlan {
  const already = input.alreadyRefundedMinor ?? 0;
  const remaining = input.totalMinor - already;
  const amountMinor = input.requestedMinor ?? remaining;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || amountMinor > remaining) return { ok: false };
  const newRefundTotal = already + amountMinor;
  const full = newRefundTotal >= input.totalMinor;
  return {
    ok: true,
    amountMinor,
    newRefundTotal,
    newStatus: full ? "refunded" : "partially_refunded",
    // Only a FULL refund takes a job request out of "paid" (the gallery gate); a partial keeps it paid.
    releasesJobRequest: full,
  };
}
