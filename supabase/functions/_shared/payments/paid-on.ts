/**
 * Pure: when money recorded by hand was received. The admin picks a date (default today);
 * today keeps the exact time, an earlier day is stored at noon UTC so it never shifts a day in
 * Israel. A later date, or one more than a year back, is refused.
 */
export function paidAtFor(
  paidOn: string | null | undefined,
  now: Date = new Date(),
): { ok: true; paidAt: string } | { ok: false; error: string } {
  if (!paidOn) return { ok: true, paidAt: now.toISOString() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, error: "Invalid payment date" };
  const day = new Date(`${paidOn}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== paidOn) {
    return { ok: false, error: "Invalid payment date" };
  }
  const today = now.toISOString().slice(0, 10);
  // The admin's "today" can already be tomorrow in UTC (Israel is ahead): that is now too.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (paidOn === today || paidOn === tomorrow) return { ok: true, paidAt: now.toISOString() };
  if (paidOn > tomorrow) return { ok: false, error: "The payment date can't be in the future" };
  const yearAgo = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (paidOn < yearAgo) return { ok: false, error: "The payment date is more than a year ago" };
  return { ok: true, paidAt: day.toISOString() };
}
