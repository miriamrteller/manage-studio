import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { enqueueDocument } from "../_shared/enqueue-document.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";

const ProcessRefundBodySchema = z.object({
  payment_id: z.string().uuid(),
  amount_minor: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  let body: z.infer<typeof ProcessRefundBodySchema>;
  try {
    body = ProcessRefundBodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (!profile?.tenant_id || !Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const tenantId = profile.tenant_id as string;

  const { data: original, error: paymentError } = await service
    .from("payments")
    .select("*")
    .eq("id", body.payment_id)
    .eq("tenant_id", tenantId)
    .single();

  if (paymentError || !original) {
    return jsonResponse({ error: "Payment not found" }, 404);
  }

  if (!["succeeded", "partially_refunded"].includes(original.status as string)) {
    return jsonResponse({ error: "Payment is not refundable" }, 409);
  }

  const alreadyRefunded = (original.refund_amount_minor as number | null) ?? 0;
  const remaining = (original.total_amount_minor as number) - alreadyRefunded;
  const refundAmount = body.amount_minor ?? remaining;

  if (refundAmount <= 0 || refundAmount > remaining) {
    return jsonResponse({ error: "Invalid refund amount" }, 400);
  }

  if (original.provider !== "manual" && original.provider_payment_ref) {
    const provider = await getPaymentProviderForTenant(service, tenantId);
    if (provider.refundCharge) {
      try {
        await provider.refundCharge({
          providerPaymentRef: original.provider_payment_ref as string,
          amountMinor: refundAmount,
        });
      } catch (err) {
        // Surface the provider's message (e.g. Grow's same-day full-refund constraint) so the
        // refund modal can show it instead of a generic 500.
        return jsonResponse(
          { error: err instanceof Error ? err.message : "Provider refund failed" },
          422,
        );
      }
    }
  }

  const newRefundTotal = alreadyRefunded + refundAmount;
  const newStatus = newRefundTotal >= (original.total_amount_minor as number)
    ? "refunded"
    : "partially_refunded";

  await service
    .from("payments")
    .update({
      status: newStatus,
      refund_amount_minor: newRefundTotal,
      refunded_at: new Date().toISOString(),
      approved_by: auth.user.id,
    })
    .eq("id", original.id);

  const { data: refundRow, error: refundInsertError } = await service
    .from("payments")
    .insert({
      tenant_id: tenantId,
      account_id: original.account_id,
      person_id: original.person_id,
      offering_id: original.offering_id,
      engagement_id: original.engagement_id,
      billing_account_id: original.billing_account_id,
      charge_type: "refund",
      provider: original.provider,
      provider_payment_ref: `refund_${original.id}_${Date.now()}`,
      payment_method: original.payment_method,
      pretax_amount_minor: 0,
      vat_rate: 0,
      vat_amount_minor: 0,
      total_amount_minor: -refundAmount,
      currency: original.currency,
      status: "succeeded",
      paid_at: new Date().toISOString(),
      refunds_payment_id: original.id,
      description: body.reason ?? "Refund",
      created_by: auth.user.id,
      approved_by: auth.user.id,
    })
    .select("id")
    .single();

  if (refundInsertError || !refundRow) {
    return jsonResponse({ error: refundInsertError?.message ?? "Refund insert failed" }, 500);
  }

  await service.from("audit_log").insert({
    tenant_id: tenantId,
    action: "payment.refunded",
    entity_type: "payment",
    entity_id: original.id as string,
    actor_id: auth.user.id,
    after_state: { refund_payment_id: refundRow.id, amount_minor: refundAmount },
  });

  await enqueueDocument(service, {
    tenantId,
    paymentId: refundRow.id as string,
    documentKind: "refund",
  });

  return jsonResponse({ ok: true, refundPaymentId: refundRow.id });
});
