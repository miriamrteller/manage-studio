import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { startPlatformCardSetup } from "../_shared/payments/takbull/platform-billing.ts";
import { tenantBaseUrlFor } from "../_shared/tenant-url.ts";

/**
 * OpalSwift's own billing, step B2 (dev website only): a studio admin adds a card for their
 * OpalSwift plan. Opens a Takbull page of OpalSwift's own account; the first month's charge
 * saves the card (platform-billing-ipn confirms it with Takbull). Answers { url } to open.
 * Without OpalSwift's keys saved (the live site, until billing launches) it answers not_set_up.
 */
Deno.serve(withMonitoring("platform-billing-card", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();
  if (!profile?.tenant_id) return jsonResponse({ error: "Profile not found" }, 404);
  if (!Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }

  const tenantId = profile.tenant_id as string;
  const result = await startPlatformCardSetup(service, {
    tenantId,
    returnBaseUrl: await tenantBaseUrlFor(service, tenantId),
  });
  if (result.ok) return jsonResponse({ ok: true, url: result.url, amount_agorot: result.amountAgorot });
  const status = result.code === "already_paid" ? 409 : result.code === "not_set_up" ? 400 : 502;
  return jsonResponse({ ok: false, code: result.code, message: result.message ?? null }, status);
}));
