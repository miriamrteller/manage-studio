import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { createJobPaymentRequestCharge } from "../_shared/jobs/create-request-charge.ts";
import { loadJobPaymentRequestByToken } from "../_shared/jobs/load-request.ts";

/**
 * Public pay page backend for /pay/:token (no session — the token IS the capability).
 *
 *   get           → what the client sees: studio, label, amount, due date, status.
 *   create_charge → hosted YPay page URL for this request (refused unless collectable).
 *   status        → poll after returning from the hosted page.
 *
 * Deliberately narrow: no person/finance rows leave this function, only the
 * request's own public facts. Tokens are 48 hex chars and unguessable.
 */
const BodySchema = z.object({
  token: z.string().min(16).max(128),
  action: z.enum(["get", "create_charge", "status"]).default("get"),
});

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  try {
    const service = createServiceClient();
    const request = await loadJobPaymentRequestByToken(service, body.token);
    if (!request) return jsonResponse({ error: "Payment request not found" }, 404);

    const { data: tenant } = await service
      .from("tenants")
      .select("id, name, language_default, primary_color, accent_color, logo_url, payment_provider")
      .eq("id", request.tenant_id)
      .single();
    if (!tenant) return jsonResponse({ error: "Studio not found" }, 404);

    const { data: engagement } = await service
      .from("engagements")
      .select("booked_starts_at, status")
      .eq("id", request.engagement_id)
      .maybeSingle();

    const publicView = {
      id: request.id,
      label: request.label,
      amountMinor: request.amount_minor,
      currency: request.currency,
      dueDate: request.due_date,
      status: request.status,
      paidAt: request.paid_at,
      maxInstallments: request.max_installments,
      jobDate: engagement?.booked_starts_at ?? null,
      jobCancelled: engagement?.status === "cancelled" || engagement?.status === "withdrawn",
      studio: {
        name: tenant.name,
        language: tenant.language_default === "he" ? "he" : "en",
        primaryColor: tenant.primary_color,
        accentColor: tenant.accent_color,
        logoUrl: tenant.logo_url ?? null,
      },
      paymentProvider: tenant.payment_provider,
    };

    if (body.action === "get" || body.action === "status") {
      return jsonResponse({ request: publicView });
    }

    const charge = await createJobPaymentRequestCharge(service, request, {
      tenantLabel: tenant.name as string,
    });
    if (!charge.ok) return jsonResponse({ error: charge.error, request: publicView }, charge.status);

    return jsonResponse({ request: publicView, pageUrl: charge.pageUrl });
  } catch (error) {
    console.error("[job-payment-request-public]", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
