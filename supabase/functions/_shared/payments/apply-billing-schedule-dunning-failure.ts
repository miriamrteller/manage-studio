import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { dunningNextAttemptAt } from "./billing-time.ts";
import { sendPaymentDunningReminder } from "../collections/send-payment-dunning-reminder.ts";

const MAX_FAILURE_MESSAGE_LENGTH = 500;

export async function applyBillingScheduleDunningFailure(
  service: SupabaseClient,
  input: { billingScheduleId: string; failureMessage: string },
): Promise<{
  attemptCount: number;
  nextAttemptAt: string | null;
  suspended: boolean;
  skipped?: boolean;
}> {
  const truncatedMessage = input.failureMessage.length > MAX_FAILURE_MESSAGE_LENGTH
    ? input.failureMessage.slice(0, MAX_FAILURE_MESSAGE_LENGTH)
    : input.failureMessage;

  const { data: schedule } = await service
    .from("billing_schedules")
    .select("id, tenant_id, engagement_id, attempt_count, status")
    .eq("id", input.billingScheduleId)
    .single();

  if (!schedule) {
    return { skipped: true, attemptCount: 0, nextAttemptAt: null, suspended: false };
  }

  const attemptCount = schedule.attempt_count as number;
  const status = schedule.status as string;

  if (status === "suspended") {
    return {
      skipped: true,
      attemptCount,
      nextAttemptAt: null,
      suspended: true,
    };
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("person_id, offering_id")
    .eq("id", schedule.engagement_id)
    .single();

  const expectedCount = attemptCount;
  const nextAttempt = expectedCount + 1;

  const updates: Record<string, unknown> = {
    attempt_count: nextAttempt,
    last_attempt_at: new Date().toISOString(),
    last_error: truncatedMessage,
  };

  if (nextAttempt >= 3) {
    updates.status = "suspended";
    updates.next_attempt_at = null;
  } else {
    updates.next_attempt_at = dunningNextAttemptAt(nextAttempt);
  }

  const { data: updated } = await service
    .from("billing_schedules")
    .update(updates)
    .eq("id", input.billingScheduleId)
    .eq("attempt_count", expectedCount)
    .neq("status", "suspended")
    .select("attempt_count, next_attempt_at, status")
    .maybeSingle();

  if (!updated) {
    return {
      skipped: true,
      attemptCount: expectedCount,
      nextAttemptAt: null,
      suspended: false,
    };
  }

  if (nextAttempt >= 3) {
    await service
      .from("engagements")
      .update({ billing_status: "suspended" })
      .eq("id", schedule.engagement_id);
  }

  const appBase = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
  const paymentUrl = appBase ? `${appBase}/dashboard/portal` : "#";

  if (engagement) {
    await sendPaymentDunningReminder(service, {
      kind: "renewal",
      tenantId: schedule.tenant_id as string,
      engagementId: schedule.engagement_id as string,
      offeringId: engagement.offering_id as string,
      personId: engagement.person_id as string,
      subjectId: input.billingScheduleId,
      attemptCount: nextAttempt,
      nextActionAt: updated.next_attempt_at as string | null,
      paymentUrl,
    });
  }

  return {
    attemptCount: nextAttempt,
    nextAttemptAt: updated.next_attempt_at as string | null,
    suspended: nextAttempt >= 3,
  };
}
