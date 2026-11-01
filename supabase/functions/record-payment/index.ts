import { z } from "npm:zod@3.22.4";
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { resolveOfferingPrice } from "../_shared/email-dist/pricing.js";
import { finalisePayment } from "../_shared/payments/finalise-payment.ts";
import { recordManualPayment } from "../_shared/payments/manual-payment.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

const RecordPaymentBodySchema = z.object({
  engagement_id: z.string().uuid(),
  method: z.enum(["cash", "bank_transfer"]),
  amount_minor: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
});

Deno.serve(withMonitoring("record-payment", async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  let body: z.infer<typeof RecordPaymentBodySchema>;
  try {
    body = RecordPaymentBodySchema.parse(await req.json());
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

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, billing_account_id, status")
    .eq("id", body.engagement_id)
    .single();

  if (engagementError || !engagement || engagement.tenant_id !== tenantId) {
    return jsonResponse({ error: "Engagement not found" }, 404);
  }

  if (engagement.status !== "pending_payment") {
    return jsonResponse({ error: "Engagement is not pending payment" }, 409);
  }

  if (!engagement.billing_account_id) {
    return jsonResponse({ error: "Engagement missing billing account" }, 400);
  }

  const { data: existingPayment } = await service
    .from("payments")
    .select("id")
    .eq("engagement_id", body.engagement_id)
    .eq("status", "succeeded")
    .maybeSingle();

  if (existingPayment) {
    return jsonResponse({ error: "Payment already recorded" }, 409);
  }

  const [{ data: offering }, { data: tenant }] = await Promise.all([
    service.from("offerings").select("price_minor, currency").eq("id", engagement.offering_id).single(),
    service.from("tenants").select("currency").eq("id", tenantId).single(),
  ]);

  if (!offering || !tenant) {
    return jsonResponse({ error: "Offering or tenant not found" }, 404);
  }

  const pricing = resolveOfferingPrice({ price_minor: offering.price_minor as number });

  const totalMinor = body.amount_minor ?? pricing.totalMinor;

  const { data: person } = await service
    .from("people")
    .select("account_id")
    .eq("id", engagement.person_id)
    .single();

  const recorded = await recordManualPayment(
    service,
    {
      tenantId,
      engagementId: body.engagement_id,
      personId: engagement.person_id as string,
      accountId: (person?.account_id as string | null) ?? null,
      offeringId: engagement.offering_id as string,
      billingAccountId: engagement.billing_account_id as string,
      totalMinor,
      currency: (offering.currency ?? tenant.currency ?? "ILS") as string,
    },
    { method: body.method, note: body.note, actorUserId: auth.user.id },
  );

  if (!recorded.ok) {
    return jsonResponse({ error: recorded.error }, 500);
  }

  const paymentRow = recorded.row;

  await finalisePayment(service, {
    tenantId,
    paymentRow,
    engagementId: body.engagement_id,
    chargeType: "initial",
    actorUserId: auth.user.id,
  });

  return jsonResponse({
    ok: true,
    paymentId: paymentRow.id,
    completedOfflineRequest: recorded.completedRequest,
  });
}));
