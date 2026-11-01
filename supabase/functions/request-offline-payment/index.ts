/**
 * request-offline-payment
 *
 * The parent chose "pay at the studio" (cash / bank transfer) on the public enrolment
 * checkout of a tenant with no online payment provider (tenants.payment_provider = 'none').
 *
 * Records the choice as a pending manual payment on the engagement (one per engagement;
 * repeated calls update the method) and audits it. The engagement stays pending_payment
 * until a tenant admin records the money with record-payment, which completes this row.
 * Nothing is charged here and no tax document is involved.
 *
 * Auth: same as create-checkout — a signed-in parent (Bearer) or a guest holding the
 * enrolment token (WaiverToken header / enrolment_token). verify_jwt = false in config.toml.
 */
import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { resolveCheckoutSession } from "../_shared/checkout-session.ts";
import { isOfflinePaymentProvider } from "../_shared/payments/registry.ts";
import {
  buildOfflineRequestRow,
  findPendingOfflineRequest,
  OFFLINE_PAYMENT_REQUESTED,
} from "../_shared/payments/manual-payment.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

const BodySchema = z.object({
  engagement_id: z.string().uuid(),
  offering_id: z.string().uuid(),
  method: z.enum(["cash", "bank_transfer"]),
  enrolment_token: z.string().optional(),
});

Deno.serve(withMonitoring("request-offline-payment", async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const resolved = await resolveCheckoutSession(req, {
    offering_id: body.offering_id,
    engagement_id: body.engagement_id,
    ...(body.enrolment_token ? { enrolment_token: body.enrolment_token } : {}),
  });
  if (!resolved.ok) {
    return jsonResponse({ error: resolved.error }, resolved.status);
  }

  const { session } = resolved;
  const { service, tenant, engagement } = session;

  if (!isOfflinePaymentProvider(tenant.payment_provider)) {
    return jsonResponse({ error: "This studio takes payments online" }, 403);
  }

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const target = {
    tenantId: session.tenantId,
    engagementId: engagement.id,
    personId: engagement.person_id,
    accountId: (person?.account_id as string | null) ?? null,
    offeringId: engagement.offering_id,
    billingAccountId: engagement.billing_account_id,
    totalMinor: session.totalMinor,
    currency: session.currency,
  };

  const existing = await findPendingOfflineRequest(service, session.tenantId, engagement.id);
  let paymentId: string;

  if (existing) {
    const { error } = await service
      .from("payments")
      .update({
        payment_method: body.method,
        total_amount_minor: session.totalMinor,
        description: `Offline payment requested at checkout (${body.method})`,
      })
      .eq("id", existing.id)
      .eq("status", "pending");
    if (error) return jsonResponse({ error: error.message }, 500);
    paymentId = existing.id;
  } else {
    const { data, error } = await service
      .from("payments")
      .insert(buildOfflineRequestRow(target, body.method))
      .select("id")
      .single();
    if (error || !data) {
      return jsonResponse({ error: error?.message ?? "Could not record the request" }, 500);
    }
    paymentId = data.id as string;
  }

  await service.from("audit_log").insert({
    tenant_id: session.tenantId,
    action: OFFLINE_PAYMENT_REQUESTED,
    entity_type: "payment",
    entity_id: paymentId,
    actor_id: session.authUserId,
    after_state: {
      engagement_id: engagement.id,
      payment_method: body.method,
      total_amount_minor: session.totalMinor,
      currency: session.currency,
      requested_via: session.authUserId ? "signed_in" : "enrolment_token",
      updated_existing_request: Boolean(existing),
    },
  });

  return jsonResponse({
    ok: true,
    paymentId,
    method: body.method,
    amountMinor: session.totalMinor,
    currency: session.currency,
    offlineInstructions: tenant.offline_payment_instructions,
  });
}));
