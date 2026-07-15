/**
 * google-calendar-disconnect
 * Revokes the stored Google token and clears tenant Google Calendar columns.
 */
import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";
import { revokeToken } from "../_shared/google-calendar.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ error: auth.error }, auth.status);

  const service = createServiceClient();
  const { data: profile } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  const tenantId = profile?.tenant_id as string | undefined;
  const roles = (profile?.role as string[] | null) ?? [];
  if (!tenantId || !roles.includes("tenant_admin")) {
    return jsonResponse({ error: "Admin access required" }, 403);
  }

  const { data: creds } = await service.rpc("get_tenant_google_credentials", {
    p_tenant_id: tenantId,
  });
  const row = Array.isArray(creds) ? creds[0] : creds;
  if (row?.refresh_token) {
    await revokeToken(row.refresh_token as string);
  }

  const { error } = await service.rpc("disconnect_tenant_google_calendar", {
    p_tenant_id: tenantId,
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ ok: true });
});
