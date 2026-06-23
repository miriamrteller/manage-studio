import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { getPaymentProviderForTenant } from "../_shared/payments/index.ts";

/**
 * Auth health ping for a tenant's Grow (Meshulam) credentials, used by the settings
 * "Test connection" button. Returns `{ ok, valid, message }` without ever charging.
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
  const provider = await getPaymentProviderForTenant(service, tenantId);

  // Accept both the live Grow adapter and the GROW_MOCK stand-in (both expose slug "grow").
  const growProvider = provider as {
    slug: string;
    verifyCredentials?: (tenantId: string) => Promise<{ valid: boolean; message: string }>;
  };
  if (growProvider.slug !== "grow" || typeof growProvider.verifyCredentials !== "function") {
    return jsonResponse(
      { ok: false, valid: false, message: "Tenant is not configured for Grow" },
      400,
    );
  }

  const health = await growProvider.verifyCredentials(tenantId);
  return jsonResponse({ ok: health.valid, provider: "grow", ...health }, health.valid ? 200 : 502);
});
