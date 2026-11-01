/**
 * provision-studio: the operator setup wizard's one call (platform owner only).
 *
 * POST { action: "provision", ...ProvisionStudioInput } creates a studio with its
 * settings and emails the owner an invite; they become the studio's admin.
 * POST { action: "invite_owner", tenantId, ownerEmail } re-sends a failed invite.
 */
import { corsHeaders, jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { withMonitoring } from "../_shared/monitoring.ts";
import { tenantBaseUrl } from "../_shared/tenant-url.ts";
import {
  InviteOwnerSchema,
  inviteStudioOwner,
  provisionStudio,
  ProvisionStudioSchema,
  type ProvisionStudioDeps,
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
        .select("id, tenant_id")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; tenant_id: string } | null;
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

Deno.serve(withMonitoring("provision-studio", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return jsonResponse({ error: "Missing authorization" }, 401);

  const service = createServiceClient();
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const { data: profile } = await service.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  const roles = (profile?.role as string[] | null) ?? [];
  if (!roles.includes("super_admin")) return jsonResponse({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
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
