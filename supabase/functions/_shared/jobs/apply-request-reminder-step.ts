import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { JobPaymentRequestRow } from "./load-request.ts";
import { isCollectable } from "./payment-request-state.ts";
import { sendJobPaymentRequestLinkEmail } from "./send-request-link-email.ts";

/** Send the link this many days before due_date (inclusive). */
export const DUE_SOON_DAYS = 3;
/** Send one overdue reminder once the due date has passed by this many days. */
export const OVERDUE_GRACE_DAYS = 1;

export type ReminderDecision = "due_soon" | "overdue" | null;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pure decision: which reminder (if any) is due for a request today.
 * `todayIso` is the Asia/Jerusalem calendar date as YYYY-MM-DD.
 */
export function decideReminder(
  request: Pick<
    JobPaymentRequestRow,
    "status" | "due_date" | "due_reminder_sent_at" | "overdue_reminder_sent_at"
  >,
  todayIso: string,
): ReminderDecision {
  if (!isCollectable(request.status) || !request.due_date) return null;
  const due = new Date(`${request.due_date}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (daysUntilDue <= -OVERDUE_GRACE_DAYS) {
    return request.overdue_reminder_sent_at ? null : "overdue";
  }
  if (daysUntilDue <= DUE_SOON_DAYS) {
    return request.due_reminder_sent_at ? null : "due_soon";
  }
  return null;
}

/** Today's calendar date in Asia/Jerusalem as YYYY-MM-DD. */
export function todayInJerusalem(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const y = get("year"), m = get("month"), d = get("day");
  return y && m && d ? `${y}-${m}-${d}` : isoDate(now);
}

export type ReminderStepOutcome =
  | { outcome: "skipped"; reason: string }
  | { outcome: "reminded"; kind: "due_soon" | "overdue" }
  | { outcome: "error"; message: string };

/**
 * One request, one cron tick. Claims the stamp column with a conditional
 * UPDATE first (so two overlapping runs cannot both send), then emails; the
 * email path is additionally idempotent on notification_log.dunning_key.
 */
export async function applyJobPaymentReminderStep(
  service: SupabaseClient,
  request: JobPaymentRequestRow,
  todayIso: string,
): Promise<ReminderStepOutcome> {
  const decision = decideReminder(request, todayIso);
  if (!decision) return { outcome: "skipped", reason: "not_due" };

  const stampColumn = decision === "overdue" ? "overdue_reminder_sent_at" : "due_reminder_sent_at";
  const { data: claimed } = await service
    .from("job_payment_requests")
    .update({ [stampColumn]: new Date().toISOString() })
    .eq("id", request.id)
    .in("status", ["pending", "sent"])
    .is(stampColumn, null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { outcome: "skipped", reason: "concurrent_update" };

  try {
    const result = await sendJobPaymentRequestLinkEmail(service, request, { kind: decision });
    if (!result.sent) {
      await service.from("audit_log").insert({
        tenant_id: request.tenant_id,
        action: "job_payment_request.reminder_skipped",
        entity_type: "job_payment_request",
        entity_id: request.id,
        after_state: { kind: decision, reason: result.skipped },
      });
      return { outcome: "skipped", reason: result.skipped };
    }
    return { outcome: "reminded", kind: decision };
  } catch (err) {
    return { outcome: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
