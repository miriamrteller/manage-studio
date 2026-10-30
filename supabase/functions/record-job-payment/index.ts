import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { enqueueDocument } from "../_shared/enqueue-document.ts";
import { loadJobPaymentRequestById } from "../_shared/jobs/load-request.ts";
import { markJobPaymentRequestPaid } from "../_shared/jobs/mark-request-paid.ts";
import { canTransition } from "../_shared/jobs/payment-request-state.ts";

/**
 * Admin "mark paid (cash / bank transfer)" for one job payment request.
 * Mirrors record-payment: human-approved (created_by/approved_by + audit_log),
 * one succeeded payments row, document queued for the tenant's invoicing
 * provider. Gross amounts (pretax/VAT 0) — the provider computes VAT.
 */
const BodySchema = z.object({
  request_id: z.string().uuid(),
  method: z.enum(["cash", "bank_transfer"]),
  note: z.string().max(500).optional(),
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
  const tenantId = profile.tenant_id as string;

  const request = await loadJobPaymentRequestById(service, body.request_id);
  if (!request || request.tenant_id !== tenantId) {
    return jsonResponse({ error: "Payment request not found" }, 404);
  }
  if (!canTransition(request.status, "mark_paid_manual")) {
    return jsonResponse({ error: `Request is ${request.status}` }, 409);
  }

  const { data: engagement } = await service
    .from("engagements")
    .select("id, person_id, offering_id, billing_account_id")
    .eq("id", request.engagement_id)
    .eq("tenant_id", tenantId)
    .single();
  if (!engagement) return jsonResponse({ error: "Job not found" }, 404);

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const { data: paymentRow, error: insertError } = await service
    .from("payments")
    .insert({
      tenant_id: tenantId,
      account_id: person?.account_id ?? null,
      person_id: engagement.person_id,
      offering_id: engagement.offering_id,
      engagement_id: request.engagement_id,
      billing_account_id: engagement.billing_account_id,
      job_payment_request_id: request.id,
      charge_type: "initial",
      provider: "manual",
      provider_payment_ref: `manual_jpr_${request.id}_${Date.now()}`,
      payment_method: body.method,
      pretax_amount_minor: 0,
      vat_rate: 0,
      vat_amount_minor: 0,
      total_amount_minor: request.amount_minor,
      currency: request.currency.toUpperCase(),
      status: "succeeded",
      paid_at: new Date().toISOString(),
      description: body.note ?? `${request.label} — manual ${body.method}`,
      created_by: auth.user.id,
      approved_by: auth.user.id,
    })
    .select("id")
    .single();
  if (insertError || !paymentRow) {
    return jsonResponse({ error: insertError?.message ?? "Insert failed" }, 500);
  }

  const marked = await markJobPaymentRequestPaid(service, {
    requestId: request.id,
    paymentId: paymentRow.id as string,
    actorUserId: auth.user.id,
    method: body.method,
  });

  if (marked.outcome !== "paid") {
    // Lost a race (e.g. the client's card payment landed meanwhile): keep the
    // ledger honest — the manual row records money the studio says it received —
    // but tell the admin so they can refund one of the two.
    return jsonResponse(
      { error: `Request could not be marked paid (${marked.outcome})`, paymentId: paymentRow.id },
      409,
    );
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "payment_succeeded",
    entity_type: "payment",
    entity_id: paymentRow.id,
    actor_id: auth.user.id,
    after_state: {
      charge_type: "initial",
      engagement_id: request.engagement_id,
      job_payment_request_id: request.id,
      method: body.method,
      manual: true,
    },
  });

  // Offline money still needs a receipt from the tenant's invoicing provider.
  await enqueueDocument(service, { tenantId, paymentId: paymentRow.id as string, documentKind: "sale" });

  return jsonResponse({ ok: true, paymentId: paymentRow.id });
});
