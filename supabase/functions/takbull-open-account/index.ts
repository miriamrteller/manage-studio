import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { loadOpenAccountPrefill, openStudioTakbullAccount } from "../_shared/payments/takbull/open-account.ts";

/**
 * Takbull PR 7 (dev website only): a studio admin opens the studio's own Takbull account.
 * { action: "prefill" } answers what we already know (business details, owner name).
 * { action: "open", fields } calls CreateAccount with OpalSwift's keys, saves the new
 * account's keys encrypted and switches the studio to Takbull. The password, ID number and
 * bank details pass straight through: they are never stored, logged or sent back.
 * Without OpalSwift's keys saved (the live site) it answers not_set_up.
 */
Deno.serve(withMonitoring("takbull-open-account", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const service = createServiceClient();
  const { data: profile } = await service.from("user_profiles").select("tenant_id, role").eq("id", auth.user.id).single();
  if (!profile?.tenant_id) return jsonResponse({ error: "Profile not found" }, 404);
  if (!Array.isArray(profile.role) || !profile.role.includes("tenant_admin")) {
    return jsonResponse({ error: "tenant_admin role required" }, 403);
  }
  const tenantId = profile.tenant_id as string;

  const body = await req.json().catch(() => null) as { action?: unknown; fields?: unknown } | null;
  if (body?.action === "prefill") {
    return jsonResponse({ ok: true, prefill: await loadOpenAccountPrefill(service, tenantId, auth.user.id) });
  }
  if (body?.action !== "open" || !body.fields || typeof body.fields !== "object") {
    return jsonResponse({ error: "action must be prefill or open" }, 400);
  }

  const result = await openStudioTakbullAccount(service, {
    tenantId,
    userId: auth.user.id,
    fields: body.fields as Record<string, never>,
  });
  if (result.ok) return jsonResponse({ ok: true, merchant_id: result.merchantId, free_package: result.freePackage });
  const status = result.code === "invalid_input" ? 400 : result.code === "already_opened" ? 409 : result.code === "not_set_up" ? 400 : 422;
  return jsonResponse({ ok: false, code: result.code, fields: result.fields ?? null, message: result.message ?? null }, status);
}));
