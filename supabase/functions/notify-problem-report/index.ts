import { z } from "npm:zod@4.6.7";
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { sendHtmlEmail } from "../_shared/email-client.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  buildProblemReportEmail,
  DEFAULT_SUPPORT_EMAIL,
  FEEDBACK_KINDS,
  MAX_REPORT_CHARS,
} from "../_shared/problem-report-email.ts";

/**
 * notify-problem-report — a studio admin's "Send feedback" (bug, idea or help).
 * Saves it in studio_feedback, so the platform owner sees it on Platform > Feedback, and
 * emails her privately so she hears about it at once. Bugs also go to Sentry from the app
 * (for the Error fixer); ideas and help requests do not.
 *
 * Only a signed-in studio admin can call it. The studio comes from the caller's own
 * profile, never from the request. The text is the already-scrubbed message. A screenshot,
 * when attached, was uploaded by the app to the private feedback-screenshots bucket in the
 * caller's own studio folder; only that path is accepted.
 * At most 10 per studio per hour, so a loop cannot flood the owner's inbox.
 * Goes to SUPPORT_EMAIL (default support@opalswift.com), from the platform sender, with
 * Reply-To set to the sender so the owner can answer by replying.
 */

const bodySchema = z.object({
  kind: z.enum(FEEDBACK_KINDS).optional(),
  message: z.string().min(1).max(MAX_REPORT_CHARS),
  screenshotPath: z.string().max(200).nullable().optional(),
  route: z.string().max(200).nullable().optional(),
  eventId: z.string().max(64).nullable().optional(),
});

const ACTION = "problem_report_emailed";
const MAX_PER_HOUR = 10;

Deno.serve(withMonitoring("notify-problem-report", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: profile } = await service
    .from("user_profiles")
    .select("id, tenant_id, role, email")
    .eq("id", user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!profile?.tenant_id || (!roles.includes("tenant_admin") && !roles.includes("super_admin"))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid payload" }, 400);
  }

  const tenantId = profile.tenant_id as string;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("action", ACTION)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_PER_HOUR) return jsonResponse({ error: "rate_limited" }, 429);

  // Only "<own tenant id>/<uuid>.<png|jpg|webp>" in the private bucket is accepted.
  const screenshotPath = body.screenshotPath ?? null;
  const pathPattern = new RegExp(`^${tenantId}/[0-9a-f-]{36}\\.(png|jpg|webp)$`);
  if (screenshotPath && !pathPattern.test(screenshotPath)) {
    return jsonResponse({ error: "Invalid screenshot" }, 400);
  }
  const eventId = body.eventId && /^[0-9a-f]{32}$/.test(body.eventId) ? body.eventId : null;
  const kind = body.kind ?? "bug";

  const { data: tenant } = await service
    .from("tenants")
    .select("name, subdomain, skin, verticals(display_name)")
    .eq("id", tenantId)
    .single();
  const vertical = (tenant as { verticals?: { display_name?: string } | null } | null)?.verticals;

  const { data: saved, error: saveError } = await service
    .from("studio_feedback")
    .insert({
      tenant_id: tenantId,
      sent_by: profile.id,
      kind,
      message: body.message,
      route: body.route ?? null,
      screenshot_path: screenshotPath,
      sentry_event_id: eventId,
    })
    .select("id")
    .single();
  if (saveError) console.error("notify-problem-report: save failed", saveError.message);

  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (!from) {
    return saved ? jsonResponse({ ok: true, id: saved.id, email: "not_configured" }) : jsonResponse({ error: "email_not_configured" }, 503);
  }
  const to = Deno.env.get("SUPPORT_EMAIL")?.trim() || DEFAULT_SUPPORT_EMAIL;
  const sentryBase = Deno.env.get("SENTRY_EVENT_URL_BASE")?.trim() || undefined;

  const email = buildProblemReportEmail({
    kind,
    industry: vertical?.display_name ?? (tenant?.skin as string | undefined) ?? null,
    hasScreenshot: !!screenshotPath,
    studioName: (tenant?.name as string | undefined) ?? "",
    subdomain: (tenant?.subdomain as string | undefined) ?? "",
    message: body.message,
    route: body.route,
    eventId,
    sentAt: new Date().toISOString(),
    sentryEventBase: sentryBase,
  });

  let outcome: "sent" | "email_failed" = "sent";
  try {
    await sendHtmlEmail({
      to,
      from,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: (profile.email as string | null) ?? undefined,
    });
  } catch (err) {
    console.error("notify-problem-report: email failed", err instanceof Error ? err.message : err);
    outcome = "email_failed";
  }

  // The text is not repeated in the audit log: it is in studio_feedback (owner-only).
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: profile.id,
    actor_email: profile.email as string | null,
    action: ACTION,
    entity_type: "problem_report",
    after_state: { outcome, kind, feedback_id: saved?.id ?? null, event_id: eventId },
  });

  // Saved is what counts: the owner sees it on Platform > Feedback even if the email failed.
  if (saved) return jsonResponse({ ok: true, id: saved.id, email: outcome });
  return outcome === "sent" ? jsonResponse({ ok: true, id: null, email: outcome }) : jsonResponse({ error: "email_failed" }, 502);
}));
