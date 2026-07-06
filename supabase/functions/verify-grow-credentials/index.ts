import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { getEnv } from "../../packages/edge-runtime/src/env.ts";
import { MockGrowPaymentProvider } from "../_shared/payments/providers/mock-grow.ts";
import { GrowPaymentProvider } from "../_shared/payments/providers/grow.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";

/**
 * Auth health ping for a tenant's Grow (Meshulam) credentials, used by the settings
 * "Test connection" button. Returns `{ ok, valid, message }` without ever charging.
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

  if (tenantError || tenant?.payment_provider !== "grow") {
    return jsonResponse(
      { ok: false, valid: false, message: "Tenant is not configured for Grow" },
      400,
    );
  }

  const provider = getEnv("GROW_MOCK") === "true"
    ? new MockGrowPaymentProvider()
    : new GrowPaymentProvider(service);

  const health = await provider.verifyCredentials(tenantId);
  return jsonResponse({ ok: health.valid, provider: "grow", ...health }, health.valid ? 200 : 502);
});
