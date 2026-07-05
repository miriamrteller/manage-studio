import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SENT_STATUSES = ["sent", "delivered", "read", "pending"] as const;

export function buildDunningKey(
  kind: "renewal" | "enrolment_unpaid",
  subjectId: string,
  attemptCount: number,
): string {
  return `${kind}:${subjectId}:${attemptCount}`;
}

export async function hasDunningNotificationBeenSent(
  service: SupabaseClient,
  tenantId: string,
  dunningKey: string,
  templateName = "payment_reminder",
): Promise<boolean> {
  const { data } = await service
    .from("notification_log")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("template_name", templateName)
    .filter("variables->>dunning_key", "eq", dunningKey)
    .in("status", [...SENT_STATUSES])
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

export async function hasCancellationAlreadyHandled(
  service: SupabaseClient,
  tenantId: string,
  engagementId: string,
): Promise<boolean> {
  const { data: eng } = await service
    .from("engagements")
    .select("status")
    .eq("id", engagementId)
    .maybeSingle();

  if (eng?.status === "cancelled") return true;

  return hasDunningNotificationBeenSent(
    service,
    tenantId,
    buildDunningKey("enrolment_unpaid", engagementId, 3),
    "class_cancellation",
  );
}
