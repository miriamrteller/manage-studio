import { z } from "npm:zod@3.22.4";
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { sendHtmlEmail } from "../_shared/email-client.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import {
  buildProblemReportEmail,
  DEFAULT_SUPPORT_EMAIL,
  MAX_REPORT_CHARS,
} from "../_shared/problem-report-email.ts";

/**
 * notify-problem-report — when a studio admin sends "Report a problem", also email the
 * platform owner (privately) so she hears about it at once. Called by the app after
 * Sentry accepts the report; best effort: the app ignores any failure here, and the
 * report itself never depends on this email.
 *
 * Only a signed-in studio admin can call it. The studio name and subdomain come from the
 * caller's own profile, never from the request. The text is the already-scrubbed message.
 * At most 10 per studio per hour, so a loop cannot flood the owner's inbox.
 * Goes to SUPPORT_EMAIL (default support@opalswift.com), from the platform sender.
 */

const bodySchema = z.object({
  message: z.string().min(1).max(MAX_REPORT_CHARS),
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

  const { data: tenant } = await service
    .from("tenants")
    .select("name, subdomain")
    .eq("id", tenantId)
    .single();

  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL")?.trim();
  if (!from) return jsonResponse({ error: "email_not_configured" }, 503);
  const to = Deno.env.get("SUPPORT_EMAIL")?.trim() || DEFAULT_SUPPORT_EMAIL;
  const sentryBase = Deno.env.get("SENTRY_EVENT_URL_BASE")?.trim() || undefined;

  const email = buildProblemReportEmail({
    studioName: (tenant?.name as string | undefined) ?? "",
    subdomain: (tenant?.subdomain as string | undefined) ?? "",
    message: body.message,
    route: body.route,
    eventId: body.eventId,
    sentAt: new Date().toISOString(),
    sentryEventBase: sentryBase,
  });

  let outcome: "sent" | "email_failed" = "sent";
  try {
    await sendHtmlEmail({ to, from, subject: email.subject, html: email.html, text: email.text });
  } catch (err) {
    console.error("notify-problem-report: email failed", err instanceof Error ? err.message : err);
    outcome = "email_failed";
  }

  // The text is deliberately not stored here: it lives in Sentry and in the owner's inbox.
  await service.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: profile.id,
    actor_email: profile.email as string | null,
    action: ACTION,
    entity_type: "problem_report",
    after_state: { outcome, event_id: body.eventId ?? null },
  });

  return outcome === "sent" ? jsonResponse({ ok: true }) : jsonResponse({ error: "email_failed" }, 502);
}));
