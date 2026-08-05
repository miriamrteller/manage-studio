import { handleOptions, jsonResponse } from "../../../packages/edge-runtime/src/cors.ts";
import { getEnv } from "../../../packages/edge-runtime/src/env.ts";
import { MockYpayPaymentProvider } from "../_shared/payments/providers/mock-ypay.ts";
import { YpayPaymentProvider } from "../_shared/payments/providers/ypay.ts";
import { createServiceClient, requireAuthUser } from "../../../packages/edge-runtime/src/supabase.ts";

/**
 * Auth health ping for a tenant's YPay credentials — hits accessToken.
 *
 * Imports providers directly (not payments/index.ts) so the deploy bundle stays free
 * of email deps.
 *
 * YPAY_LIVE_VERIFY=true routes this read-only check to the real API even while
 * YPAY_MOCK is on, so a QA key can be validated without arming live charges.
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

  if (tenantError || tenant?.payment_provider !== "ypay") {
    return jsonResponse(
      { ok: false, valid: false, message: "Tenant is not configured for YPay" },
      400,
    );
  }

  const liveVerify = getEnv("YPAY_LIVE_VERIFY") === "true";

  if (getEnv("YPAY_MOCK") === "true" && !liveVerify) {
    const provider = new MockYpayPaymentProvider(service);
    const health = await provider.verifyCredentials(tenantId);
    return jsonResponse(
      { ok: health.valid, provider: "ypay", ...health },
      health.valid ? 200 : 502,
    );
  }

  const provider = new YpayPaymentProvider(service);
  try {
    const health = await provider.verifyCredentials(tenantId);
    return jsonResponse(
      { ok: health.valid, provider: "ypay", ...health },
      health.valid ? 200 : 502,
    );
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        valid: false,
        provider: "ypay",
        message: err instanceof Error ? err.message : "YPay verify not available",
      },
      502,
    );
  }
});
