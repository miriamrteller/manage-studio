import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { loadJobPaymentRequestById } from "../_shared/jobs/load-request.ts";
import { isCollectable } from "../_shared/jobs/payment-request-state.ts";
import { sendJobPaymentRequestLinkEmail } from "../_shared/jobs/send-request-link-email.ts";

/**
 * Admin "Send pay link" (email). WhatsApp is a wa.me deep link built in the
 * panel from the same URL — the beta tenant has no approved Twilio template.
 * Each admin click is a fresh send (salted key); the request moves to `sent`.
 */
const BodySchema = z.object({
  request_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!profile?.tenant_id || !(roles.includes("tenant_admin") || roles.includes("super_admin"))) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const request = await loadJobPaymentRequestById(service, body.request_id);
  if (!request || request.tenant_id !== profile.tenant_id) {
    return jsonResponse({ error: "Payment request not found" }, 404);
  }
  if (!isCollectable(request.status)) {
    return jsonResponse({ error: `Request is ${request.status}` }, 409);
  }

  // Light rate limit: 10 sends per request per hour (audit-backed, like admin enrolment links).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", request.tenant_id)
    .eq("action", "job_payment_request.link_sent")
    .eq("entity_id", request.id)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= 10) {
    return jsonResponse({ error: "Too many links sent for this request. Try again later." }, 429);
  }

  const result = await sendJobPaymentRequestLinkEmail(service, request, {
    kind: "admin_send",
    actorUserId: auth.user.id,
    idempotencySalt: String(Date.now()),
  });

  if (!result.sent) {
    return jsonResponse({ ok: false, skipped: result.skipped, paymentUrl: result.paymentUrl ?? null }, 422);
  }
  return jsonResponse({ ok: true, recipientEmail: result.recipientEmail, paymentUrl: result.paymentUrl });
});
