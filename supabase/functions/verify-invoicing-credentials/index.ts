import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/supabase.ts";
import { getInvoicingProviderForTenant } from "../_shared/invoicing/index.ts";

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

  try {
    const provider = await getInvoicingProviderForTenant(service, tenantId);
    await provider.authenticate(service, tenantId);
    const health = provider.checkAuthHealth
      ? await provider.checkAuthHealth(service, tenantId)
      : { valid: true };

    return jsonResponse({
      ok: true,
      provider: provider.slug,
      ...health,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        valid: false,
        message: err instanceof Error ? err.message : "Verification failed",
      },
      502,
    );
  }
});
