/**
 * platform-support-session: the OpalSwift platform owner enters a studio's admin
 * (owner decision, 11 Nov 2026: support access can do everything, logged).
 *
 *   { tenantId }   (signed in as the platform owner, after the confirm step)
 *     → { ok, access_token, refresh_token } — a session for that studio's
 *       "OpalSwift support" login: an ordinary admin of that one studio, made
 *       here on first use (no email is sent). The app swaps to it on the
 *       studio's own address only; app.opalswift.com keeps the owner's session.
 *
 * Safety:
 * - Only a signed-in super_admin (never a support login itself). If the owner
 *   uses two-step sign-in, the request must come from a session that passed it.
 * - The support login belongs to that studio only and has exactly the studio
 *   admin role. Only this function (service role) can make or change it
 *   (20261111163000_platform_support_logins.sql).
 * - Every entry is recorded in the studio's OpalSwift access log under the
 *   platform owner's own id; what the support login opens or changes is
 *   recorded there too.
 */
import { handleOptions, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { sessionForEmail } from "../_shared/client-login.ts";
import { decideSupportSession, supportLoginEmail, jwtAal } from "./decide.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Service = ReturnType<typeof createServiceClient>;

/** The studio's support login: found, or made (auth user + profile). */
async function ensureSupportLogin(service: Service, tenantId: string): Promise<string | null> {
  const { data: existing } = await service
    .from("user_profiles")
    .select("email")
    .eq("tenant_id", tenantId)
    .eq("is_platform_support", true)
    .maybeSingle();
  if (typeof existing?.email === "string" && existing.email) return existing.email;

  const email = supportLoginEmail(tenantId);
  // No subdomain in the metadata: handle_new_user makes no profile for it.
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { platform_support: true },
  });
  let userId = created?.user?.id ?? null;
  if (createError || !userId) {
    // Made on an earlier try that stopped before the profile: find it.
    const { data: found } = await service.rpc("platform_support_auth_user_id", { p_email: email });
    userId = typeof found === "string" ? found : null;
  }
  if (!userId) return null;

  const { error: profileError } = await service.from("user_profiles").upsert({
    id: userId,
    tenant_id: tenantId,
    role: ["tenant_admin"],
    email,
    is_platform_support: true,
  });
  if (profileError) {
    console.error("[platform-support-session] profile failed:", profileError.message);
    return null;
  }
  return email;
}

Deno.serve(withMonitoring("platform-support-session", async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuthUser(req);
  if ("error" in auth) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const tenantId = typeof body?.tenantId === "string" && UUID.test(body.tenantId) ? body.tenantId : null;
  if (!tenantId) return jsonResponse({ ok: false, error: "tenantId required" }, 400);

  const service = createServiceClient();
  const [{ data: profile }, { data: tenant }, factors] = await Promise.all([
    service.from("user_profiles").select("role, is_platform_support").eq("id", auth.user.id).maybeSingle(),
    service.from("tenants").select("id").eq("id", tenantId).maybeSingle(),
    service.auth.admin.mfa.listFactors({ userId: auth.user.id }),
  ]);

  const decision = decideSupportSession({
    roles: Array.isArray(profile?.role) ? (profile.role as string[]) : [],
    isSupportLogin: profile?.is_platform_support === true,
    studioExists: !!tenant?.id,
    hasVerifiedFactor: (factors.data?.factors ?? []).some((f: { status?: string }) => f.status === "verified"),
    aal: jwtAal(auth.authHeader),
  });
  if (!decision.ok) return jsonResponse({ ok: false, error: decision.error }, decision.status);

  const email = await ensureSupportLogin(service, tenantId);
  if (!email) return jsonResponse({ ok: false, error: "support_login_failed" }, 500);

  const session = await sessionForEmail(service, email);
  if (!session) return jsonResponse({ ok: false, error: "support_login_failed" }, 500);

  // The entry, under the platform owner's own id (who opened it, and when).
  const { error: logError } = await service.from("platform_access_log").insert({
    tenant_id: tenantId,
    actor_id: auth.user.id,
    kind: "view",
    area: "support-entry",
  });
  if (logError) {
    // Never hand over access that is not on the studio's record.
    console.error("[platform-support-session] log failed:", logError.message);
    return jsonResponse({ ok: false, error: "log_failed" }, 500);
  }

  return jsonResponse({ ok: true, ...session });
}));
