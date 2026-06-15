import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

/** Advance billing schedule after successful renewal payment (Jerusalem month anchor). */
export async function advanceBillingSchedule(
  service: SupabaseClient,
  billingScheduleId: string,
  paidAt: Date = new Date(),
): Promise<void> {
  const { data: schedule, error } = await service
    .from("billing_schedules")
    .select("id, next_billing_date, engagement_id")
    .eq("id", billingScheduleId)
    .single();

  if (error || !schedule) {
    throw new Error(`Billing schedule not found: ${billingScheduleId}`);
  }

  const paidMonth = paidAt.toISOString().slice(0, 7);
  const nextBillingDate = schedule.next_billing_date as string;
  if (nextBillingDate > `${paidMonth}-01`) {
    return;
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
    .eq("id", billingScheduleId);
}
