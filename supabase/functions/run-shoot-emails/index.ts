/**
 * run-shoot-emails — hourly pg_cron job (20261030000300_quotes.sql).
 *
 * Sends the time-based photographer emails returned by list_due_shoot_emails():
 *   shoot_reminder  — 1–2 days before a booked shoot
 *   shoot_thank_you — 1–3 days after the shoot
 *   gallery_ready   — within 7 days of the client first seeing the gallery
 *                     (released by hand, or everything paid: gallery_shared_at).
 *                     Built like Send gallery: one button, to the photo shop when
 *                     the shoot has one, never to SmugMug (skipped if that is all).
 *   review_request  — 5–12 days after the gallery is shared, when the studio
 *                     has a review link (tenants.review_url)
 * First it moves project statuses on (advance_job_statuses: booked → shot the
 * day after the shoot, → delivered once the gallery or photos reach the client).
 * Windows tolerate missed runs; claim_automatic_email() makes each send happen
 * once and skips tenants that switched an email off.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET. Fails closed when the secret is
 * unset — this endpoint sends email.
 */
import { jsonResponse, internalError } from "../_shared/edge-runtime/cors.ts";
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
import { hourlyGalleryEmailVariables } from "../_shared/photo-shop/hourly-gallery-email.ts";
import { resolveEmailLanguage } from "../_shared/resolve-email-language.ts";

Deno.serve(withMonitoring("run-shoot-emails", async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const service = createServiceClient();
  // Statuses first; a failure here never stops the emails.
  const { data: moved, error: moveError } = await service.rpc("advance_job_statuses", {});
  if (moveError) console.error("[run-shoot-emails] advance_job_statuses:", moveError.message);
  else console.log("[run-shoot-emails] statuses moved", JSON.stringify(moved));

  const { data, error } = await service.rpc("list_due_shoot_emails", {});
  if (error) {
    console.error("[run-shoot-emails] list_due_shoot_emails:", error.message);
    return internalError("run-shoot-emails", error);
  }
  const rows = (data ?? []) as DueShootEmail[];
  if (rows.length === 0) return jsonResponse({ processed: 0 });

  const tenantIds = [...new Set(rows.map((row) => row.tenant_id))];
  const { data: tenants, error: tenantError } = await service
    .from("tenants").select(AUTOMATIC_EMAIL_TENANT_COLUMNS).in("id", tenantIds);
  if (tenantError) return internalError("run-shoot-emails", tenantError);
  const tenantById = new Map(
    ((tenants ?? []) as unknown as AutomaticEmailTenant[]).map((tenant) => [tenant.id, tenant]),
  );

  const counts: Record<AutomaticEmailOutcome | "invalid", number> = { sent: 0, skipped: 0, failed: 0, invalid: 0 };
  for (const row of rows) {
    const tenant = tenantById.get(row.tenant_id);
    if (
      !tenant ||
      (row.email_key === "gallery_ready" && !isSafeLink(row.gallery_url)) ||
      (row.email_key === "review_request" && !isSafeLink(tenant.review_url))
    ) {
      counts.invalid += 1;
      continue;
    }
    try {
      // The client's email goes in the client's own language.
      const language = await resolveEmailLanguage(service, {
        tenantId: row.tenant_id,
        email: row.recipient_email,
        tenantDefault: tenant.language_default,
      });
      // gallery_ready: one button to the photo shop, never SmugMug (Send gallery's rules).
      const variables = row.email_key === "gallery_ready"
        ? await hourlyGalleryEmailVariables(service, row, tenant, language)
        : dueShootEmailVariables(row, language, tenant.review_url);
      if (!variables) {
        counts.invalid += 1;
        continue;
      }
      const outcome = await sendAutomaticEmail(service, {
        tenant,
        key: row.email_key,
        engagementId: row.engagement_id,
        to: row.recipient_email,
        language,
        variables,
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
