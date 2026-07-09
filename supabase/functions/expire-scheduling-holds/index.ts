/**
 * expire-scheduling-holds
 *
 * Invoked by pg_cron every minute (see 003500 migration).
 * Also callable manually by admin as a POST with no body.
 *
 * Responsibilities:
 *   1. Pre-expiry reminder: email the client N minutes before a hold expires
 *      (tenant_scheduling_settings.expiry_reminder_mins). Sent at most once.
 *   2. Expire holds past expires_at: release the slot and, if a pending_payment
 *      appointment engagement is linked and still unpaid, cancel it. Group-class
 *      dunning is untouched (only booked_starts_at engagements are cancelled).
 *   3. Optional "slot released" email when the tenant has reminders enabled.
 *
 * Security: invoked via pg_cron net.http_post with x-cron-secret header.
 */

import { jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient } from "../../packages/edge-runtime/src/supabase.ts";
import { sendHtmlEmail } from "../_shared/resend-client.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "";
const BATCH_LIMIT = 200;

interface HoldRow {
  id: string;
  tenant_id: string;
  offering_id: string;
  starts_at: string;
  expires_at: string;
  client_email: string | null;
  client_name: string | null;
  engagement_id: string | null;
  reminder_sent_at: string | null;
}

interface TenantSettings {
  tenant_id: string;
  expiry_reminder_mins: number | null;
}

interface TenantInfo {
  id: string;
  name: string | null;
  from_email: string | null;
  language_default: string | null;
}

function reminderHtml(lang: string, schoolName: string, startsAt: string, bookUrl: string): string {
  const he = lang !== "en";
  const dir = he ? "rtl" : "ltr";
  const when = new Date(startsAt).toLocaleString(he ? "he-IL" : "en-US", {
    timeZone: "Asia/Jerusalem",
  });
  const body = he
    ? `<p>שריון הפגישה שלך (${when}) יפוג בקרוב. השלם את התשלום כדי לאשר את ההזמנה.</p>`
    : `<p>Your held appointment (${when}) is about to expire. Complete payment to confirm your booking.</p>`;
  const cta = he ? "השלם הזמנה" : "Complete booking";
  return `<div dir="${dir}"><h2>${schoolName}</h2>${body}<p><a href="${bookUrl}">${cta}</a></p></div>`;
}

function releasedHtml(lang: string, schoolName: string, bookUrl: string): string {
  const he = lang !== "en";
  const dir = he ? "rtl" : "ltr";
  const body = he
    ? `<p>שריון הפגישה שלך פג ולא הושלם תשלום. השעה שוחררה — ניתן להזמין שוב.</p>`
    : `<p>Your appointment hold expired without payment. The slot has been released — feel free to book again.</p>`;
  const cta = he ? "הזמן שוב" : "Book again";
  return `<div dir="${dir}"><h2>${schoolName}</h2>${body}<p><a href="${bookUrl}">${cta}</a></p></div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && cronHeader !== CRON_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  let remindersSent = 0;
  let expired = 0;
  let engagementsCancelled = 0;

  // Collect tenant helpers lazily.
  const settingsCache = new Map<string, TenantSettings>();
  const tenantCache = new Map<string, TenantInfo>();

  async function getSettings(tenantId: string): Promise<TenantSettings | null> {
    if (settingsCache.has(tenantId)) return settingsCache.get(tenantId)!;
    const { data } = await service
      .from("tenant_scheduling_settings")
      .select("tenant_id, expiry_reminder_mins")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data) settingsCache.set(tenantId, data as TenantSettings);
    return (data as TenantSettings) ?? null;
  }

  async function getTenant(tenantId: string): Promise<TenantInfo | null> {
    if (tenantCache.has(tenantId)) return tenantCache.get(tenantId)!;
    const { data } = await service
      .from("tenants")
      .select("id, name, from_email, language_default")
      .eq("id", tenantId)
      .maybeSingle();
    if (data) tenantCache.set(tenantId, data as TenantInfo);
    return (data as TenantInfo) ?? null;
  }

  // 1. Pre-expiry reminders (open, unreminded, not yet expired)
  const { data: upcoming, error: upErr } = await service
    .from("scheduling_holds")
    .select("id, tenant_id, offering_id, starts_at, expires_at, client_email, client_name, engagement_id, reminder_sent_at")
    .is("released_at", null)
    .is("reminder_sent_at", null)
    .gt("expires_at", nowIso)
    .limit(BATCH_LIMIT);

  if (upErr) {
    console.error("[expire-scheduling-holds] upcoming fetch error", upErr);
  } else {
    for (const hold of (upcoming ?? []) as HoldRow[]) {
      const settings = await getSettings(hold.tenant_id);
      if (!settings?.expiry_reminder_mins || !hold.client_email) continue;
      const msLeft = new Date(hold.expires_at).getTime() - Date.now();
      if (msLeft > settings.expiry_reminder_mins * 60_000) continue;

      const tenant = await getTenant(hold.tenant_id);
      const from = tenant?.from_email;
      if (from) {
        try {
          await sendHtmlEmail({
            to: hold.client_email,
            from,
            subject: (tenant?.language_default !== "en")
              ? "שריון הפגישה שלך עומד לפוג"
              : "Your appointment hold is expiring soon",
            html: reminderHtml(
              tenant?.language_default ?? "he",
              tenant?.name ?? "",
              hold.starts_at,
              `${APP_URL}/book`,
            ),
          });
          remindersSent++;
        } catch (e) {
          console.error("[expire-scheduling-holds] reminder send failed", hold.id, String(e));
        }
      }
      await service
        .from("scheduling_holds")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", hold.id);
    }
  }

  // 2. Expire holds past expires_at
  const { data: dueHolds, error: dueErr } = await service
    .from("scheduling_holds")
    .select("id, tenant_id, offering_id, starts_at, expires_at, client_email, client_name, engagement_id, reminder_sent_at")
    .is("released_at", null)
    .lt("expires_at", nowIso)
    .limit(BATCH_LIMIT);

  if (dueErr) {
    console.error("[expire-scheduling-holds] due fetch error", dueErr);
    return jsonResponse({ error: dueErr.message }, 500);
  }

  for (const hold of (dueHolds ?? []) as HoldRow[]) {
    // Cancel linked, still-unpaid appointment engagement (never touch group classes)
    if (hold.engagement_id) {
      const { data: eng } = await service
        .from("engagements")
        .select("id, status, payment_received_at, booked_starts_at")
        .eq("id", hold.engagement_id)
        .maybeSingle();
      if (
        eng &&
        eng.status === "pending_payment" &&
        !eng.payment_received_at &&
        eng.booked_starts_at
      ) {
        await service
          .from("engagements")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "booking_hold_expired",
          })
          .eq("id", eng.id)
          .eq("status", "pending_payment");
        engagementsCancelled++;
      }
    }

    await service
      .from("scheduling_holds")
      .update({ released_at: new Date().toISOString() })
      .eq("id", hold.id)
      .is("released_at", null);
    expired++;

    // Optional slot-released email (tenant opted into reminders)
    const settings = await getSettings(hold.tenant_id);
    if (settings?.expiry_reminder_mins && hold.client_email) {
      const tenant = await getTenant(hold.tenant_id);
      if (tenant?.from_email) {
        try {
          await sendHtmlEmail({
            to: hold.client_email,
            from: tenant.from_email,
            subject: (tenant.language_default !== "en")
              ? "שריון הפגישה שוחרר"
              : "Your appointment hold was released",
            html: releasedHtml(tenant.language_default ?? "he", tenant.name ?? "", `${APP_URL}/book`),
          });
        } catch (e) {
          console.error("[expire-scheduling-holds] released send failed", hold.id, String(e));
        }
      }
    }
  }

  return jsonResponse({ ok: true, remindersSent, expired, engagementsCancelled });
});
