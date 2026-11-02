import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";

/**
 * The amount for one month of a monthly plan (payments follow-up 5), in order:
 *   1. a one-off amount for that month (billing_month_adjustments), else
 *   2. the student's own monthly amount (billing_schedules.amount_minor), else
 *   3. the class price.
 * No pro-rating or discount rules: those would be further adjustment kinds resolved here.
 */
export type MonthAmountSource = "one_off" | "student" | "class";

export interface MonthAmount {
  amountMinor: number;
  source: MonthAmountSource;
  /** The admin's reason for a one-off or student amount. */
  note: string | null;
}

/** Pure: the rule above. */
export function pickMonthAmount(input: {
  classPriceMinor: number;
  studentAmountMinor: number | null | undefined;
  studentNote?: string | null;
  oneOff?: { amount_minor: number; note: string | null } | null;
}): MonthAmount {
  if (input.oneOff && input.oneOff.amount_minor > 0) {
    return { amountMinor: input.oneOff.amount_minor, source: "one_off", note: input.oneOff.note };
  }
  if (input.studentAmountMinor != null && input.studentAmountMinor > 0) {
    return { amountMinor: input.studentAmountMinor, source: "student", note: input.studentNote ?? null };
  }
  return { amountMinor: input.classPriceMinor, source: "class", note: null };
}

export async function resolveMonthAmount(
  service: SupabaseClient,
  params: { scheduleId: string; period: string; classPriceMinor: number },
): Promise<MonthAmount> {
  const [{ data: schedule }, { data: oneOff }] = await Promise.all([
    service
      .from("billing_schedules")
      .select("amount_minor, amount_note")
      .eq("id", params.scheduleId)
      .maybeSingle(),
    service
      .from("billing_month_adjustments")
      .select("amount_minor, note")
      .eq("billing_schedule_id", params.scheduleId)
      .eq("period", params.period)
      .eq("kind", "one_off")
      .maybeSingle(),
  ]);
  return pickMonthAmount({
    classPriceMinor: params.classPriceMinor,
    studentAmountMinor: (schedule?.amount_minor as number | null | undefined) ?? null,
    studentNote: (schedule?.amount_note as string | null | undefined) ?? null,
    oneOff: (oneOff as { amount_minor: number; note: string | null } | null) ?? null,
  });
}
