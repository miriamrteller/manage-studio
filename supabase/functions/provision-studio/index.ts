/**
 * provision-studio: the operator setup wizard's one call (platform owner only).
 *
 * POST { action: "provision", ...ProvisionStudioInput } creates a studio with its
 * settings and emails the owner an invite; they become the studio's admin.
 * POST { action: "invite_owner", tenantId, ownerEmail } re-sends a failed invite.
 *
 * POST { action: "self_serve", ...SelfServeStudioInput } (any signed-in account
 * with a confirmed email, free beta): creates a studio and makes the caller its
 * admin. Off unless SELF_SERVE_SIGNUP_ENABLED=true. If TURNSTILE_SECRET_KEY is
 * set, a Turnstile token (captchaToken) is required.
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";
import {
  exactIlikePattern,
  InviteOwnerSchema,
  inviteStudioOwner,
  provisionStudio,
  ProvisionStudioSchema,
  SELF_SERVE_REFUSAL_STATUS,
  selfServeStudio,
  SelfServeStudioSchema,
  verifyTurnstile,
  type ProvisionStudioDeps,
  type SelfServeDeps,
} from "../_shared/provision-studio.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

function serviceDeps(service: ServiceClient): ProvisionStudioDeps {
  return {
    async provisionStudio(input) {
      const { data, error } = await service.rpc("provision_studio", {
        p_name: input.name,
        p_subdomain: input.subdomain,
        p_plan: input.plan,
        p_vertical: input.vertical,
        p_owner_email: input.ownerEmail,
        p_language_default: input.languageDefault,
        p_country: input.country,
        p_currency: input.currency,
        p_phone_region: input.phoneRegion,
        p_payment_provider: input.paymentProvider,
        p_invoicing_provider: input.invoicingProvider,
        p_primary_color: input.primaryColor,
        p_accent_color: input.accentColor,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    async findProfileByEmail(email) {
      const { data, error } = await service
        .from("user_profiles")
        .select("id, tenant_id, role")
        .ilike("email", exactIlikePattern(email))
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; tenant_id: string; role: string[] | null } | null;
    },
    async tenantSubdomain(tenantId) {
      const { data } = await service.from("tenants").select("subdomain").eq("id", tenantId).maybeSingle();
      return (data?.subdomain as string | undefined) ?? null;
    },
    async inviteUser(email, subdomain) {
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
        data: { subdomain },
        redirectTo: `${tenantBaseUrl(subdomain)}/auth/callback`,
      });
      if (error || !data.user) throw new Error(error?.message ?? "Invite failed");
      return { userId: data.user.id };
    },
    async assignOwner(tenantId, userId) {
      const { error } = await service.rpc("assign_studio_owner", { p_tenant_id: tenantId, p_user_id: userId });
      if (error) throw new Error(error.message);
    },
  };
}

function selfServeDeps(service: ServiceClient, req: Request): SelfServeDeps {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim();
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return {
    enabled: Deno.env.get("SELF_SERVE_SIGNUP_ENABLED")?.trim() === "true",
    verifyCaptcha: secret ? (token) => verifyTurnstile(secret, token, ip) : null,
    async createStudio(userId, input) {
      const { data, error } = await service.rpc("create_self_serve_studio", {
        p_user_id: userId,
        p_name: input.name,
        p_subdomain: input.subdomain,
        p_plan: input.plan,
        p_vertical: input.vertical,
        p_language_default: input.languageDefault,
        p_country: input.country,
        p_currency: input.currency,
        p_phone_region: input.phoneRegion,
        p_payment_provider: input.paymentProvider,
        p_invoicing_provider: input.invoicingProvider,
        p_primary_color: input.primaryColor,
        p_accent_color: input.accentColor,
        p_terms_version: input.termsVersion,
        p_terms_language: input.termsLanguage,
        p_ip_address: ip,
        p_user_agent: req.headers.get("user-agent"),
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
  };
}

Deno.serve(withMonitoring("provision-studio", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Self-serve: the caller creates their own studio (checks inside).
  if (body.action === "self_serve") {
    const parsed = SelfServeStudioSchema.safeParse(body);
    if (!parsed.success) return jsonResponse({ error: "Invalid request", issues: parsed.error.issues }, 400);
    const result = await selfServeStudio(selfServeDeps(service, req), user, parsed.data);
    if (result.ok) return jsonResponse(result);
    if (result.error === "invalid") return jsonResponse({ error: result.message ?? "Invalid request" }, 400);
    return jsonResponse({ error: result.error }, SELF_SERVE_REFUSAL_STATUS[result.error]);
  }

  const { data: profile } = await service.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!roles.includes("super_admin")) return jsonResponse({ error: "Forbidden" }, 403);
  const deps = serviceDeps(service);

  if (body.action === "invite_owner") {
    const parsed = InviteOwnerSchema.safeParse(body);
    if (!parsed.success) return jsonResponse({ error: "Invalid request", issues: parsed.error.issues }, 400);
    const owner = await inviteStudioOwner(deps, parsed.data.tenantId, parsed.data.ownerEmail);
    return jsonResponse({ owner });
  }

  const parsed = ProvisionStudioSchema.safeParse(body);
  if (!parsed.success) return jsonResponse({ error: "Invalid request", issues: parsed.error.issues }, 400);
  try {
    const result = await provisionStudio(deps, parsed.data);
    if (!result.ok) return jsonResponse({ error: result.error }, 409);
    return jsonResponse(result);
  } catch (err) {
    // provision_studio's messages are plain validation text (taken subdomain etc.).
    return jsonResponse({ error: err instanceof Error ? err.message : "Provisioning failed" }, 400);
  }
}));
