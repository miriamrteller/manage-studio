/**
 * run-shoot-emails — hourly pg_cron job (20261030000300_quotes.sql).
 *
 * Sends the time-based photographer emails returned by list_due_shoot_emails():
 *   shoot_reminder  — 1–2 days before a booked shoot
 *   shoot_thank_you — 1–3 days after the shoot
 *   gallery_ready   — within 7 days of job_details.gallery_released_at (Thread A)
 * Windows tolerate missed runs; claim_automatic_email() makes each send happen
 * once and skips tenants that switched an email off.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET. Fails closed when the secret is
 * unset — this endpoint sends email.
 */
import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import {
  AUTOMATIC_EMAIL_TENANT_COLUMNS,
  type AutomaticEmailOutcome,
  type AutomaticEmailTenant,
  sendAutomaticEmail,
} from "../_shared/photographer-emails/send.ts";
import { type DueShootEmail, dueShootEmailVariables, isSafeLink } from "../_shared/photographer-emails/variables.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

Deno.serve(withMonitoring("run-shoot-emails", async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const service = createServiceClient();
  const { data, error } = await service.rpc("list_due_shoot_emails", {});
  if (error) {
    console.error("[run-shoot-emails] list_due_shoot_emails:", error.message);
    return jsonResponse({ error: error.message }, 500);
  }
  const rows = (data ?? []) as DueShootEmail[];
  if (rows.length === 0) return jsonResponse({ processed: 0 });

  const tenantIds = [...new Set(rows.map((row) => row.tenant_id))];
  const { data: tenants, error: tenantError } = await service
    .from("tenants").select(AUTOMATIC_EMAIL_TENANT_COLUMNS).in("id", tenantIds);
  if (tenantError) return jsonResponse({ error: tenantError.message }, 500);
  const tenantById = new Map(
    ((tenants ?? []) as unknown as AutomaticEmailTenant[]).map((tenant) => [tenant.id, tenant]),
  );

  const counts: Record<AutomaticEmailOutcome | "invalid", number> = { sent: 0, skipped: 0, failed: 0, invalid: 0 };
  for (const row of rows) {
    const tenant = tenantById.get(row.tenant_id);
    if (!tenant || (row.email_key === "gallery_ready" && !isSafeLink(row.gallery_url))) {
      counts.invalid += 1;
      continue;
    }
    try {
      const outcome = await sendAutomaticEmail(service, {
        tenant,
        key: row.email_key,
        engagementId: row.engagement_id,
        to: row.recipient_email,
        variables: dueShootEmailVariables(row, tenant.language_default === "he" ? "he" : "en"),
      });
      counts[outcome] += 1;
    } catch (sendError) {
      console.error(`[run-shoot-emails] ${row.email_key} ${row.engagement_id}:`, sendError);
      counts.failed += 1;
    }
  }

  console.log("[run-shoot-emails]", JSON.stringify(counts));
  return jsonResponse({ processed: rows.length, ...counts });
}));
