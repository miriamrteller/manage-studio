import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * Advance billing schedule after successful renewal payment (Jerusalem month anchor).
 * With `paidForPeriod` (a month recorded by hand, YYYY-MM) it moves on one month only while
 * that month is still the one due, whatever today's date is.
 */
export async function advanceBillingSchedule(
  service: SupabaseClient,
  billingScheduleId: string,
  paidAt: Date = new Date(),
  options: { paidForPeriod?: string } = {},
): Promise<void> {
  const { data: schedule, error } = await service
    .from("billing_schedules")
    .select("id, next_billing_date, engagement_id")
    .eq("id", billingScheduleId)
    .single();

  if (error || !schedule) {
    throw new Error(`Billing schedule not found: ${billingScheduleId}`);
  }

  const nextBillingDate = schedule.next_billing_date as string;
  if (options.paidForPeriod) {
    if (nextBillingDate.slice(0, 7) !== options.paidForPeriod) return;
  } else {
    const paidMonth = paidAt.toISOString().slice(0, 7);
    if (nextBillingDate > `${paidMonth}-01`) {
      return;
    }
  }

  const current = new Date(`${nextBillingDate}T12:00:00+03:00`);
  current.setMonth(current.getMonth() + 1);
  const nextDate = current.toISOString().slice(0, 10);

  await service
    .from("billing_schedules")
    .update({
      next_billing_date: nextDate,
      next_attempt_at: null,
      attempt_count: 0,
      last_error: null,
      last_attempt_at: paidAt.toISOString(),
    })
    .eq("id", billingScheduleId)
    .eq("next_billing_date", nextBillingDate);
}
