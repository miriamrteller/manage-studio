import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { getEnv } from "../../packages/edge-runtime/src/env.ts";
import { MockInvoice4uPaymentProvider } from "../_shared/payments/providers/mock-invoice4u.ts";
import { Invoice4uPaymentProvider } from "../_shared/payments/providers/invoice4u.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";

/**
 * Auth health ping for a tenant's Invoice4U credentials.
 * U1 stub: INVOICE4U_MOCK → valid; live probe deferred to U2b.
 *
 * Imports providers directly (not payments/index.ts) so deploy bundle stays free of email deps.
 */
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

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    return jsonResponse({ error: "Profile not found" }, 404);
  }
  if (!Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const tenantId = profile.tenant_id as string;
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("payment_provider")
    .eq("id", tenantId)
    .single();

  if (tenantError || tenant?.payment_provider !== "invoice4u") {
    return jsonResponse(
      { ok: false, valid: false, message: "Tenant is not configured for Invoice4U" },
      400,
    );
  }

  if (getEnv("INVOICE4U_MOCK") === "true") {
    const provider = new MockInvoice4uPaymentProvider();
    const health = await provider.verifyCredentials(tenantId);
    return jsonResponse(
      { ok: health.valid, provider: "invoice4u", ...health },
      health.valid ? 200 : 502,
    );
  }

  // Live verify lands in U2b — stub fails closed so UI can show "not yet available".
  const provider = new Invoice4uPaymentProvider(service);
  try {
    const health = await provider.verifyCredentials(tenantId);
    return jsonResponse(
      { ok: health.valid, provider: "invoice4u", ...health },
      health.valid ? 200 : 502,
    );
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        valid: false,
        provider: "invoice4u",
        message: err instanceof Error ? err.message : "Invoice4U verify not available",
      },
      501,
    );
  }
});
