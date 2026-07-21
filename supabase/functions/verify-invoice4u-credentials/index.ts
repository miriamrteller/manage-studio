import { handleOptions, jsonResponse } from "../../packages/edge-runtime/src/cors.ts";
import { getEnv } from "../../packages/edge-runtime/src/env.ts";
import { MockInvoice4uPaymentProvider } from "../_shared/payments/providers/mock-invoice4u.ts";
import { Invoice4uPaymentProvider } from "../_shared/payments/providers/invoice4u.ts";
import { createServiceClient, requireAuthUser } from "../../packages/edge-runtime/src/supabase.ts";

/**
 * Auth health ping for a tenant's Invoice4U credentials.
 * U1 stub: INVOICE4U_MOCK → valid; live probe deferred to U2b.
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

  if (tenantError || tenant?.payment_provider !== "invoice4u") {
    return jsonResponse(
      { ok: false, valid: false, message: "Tenant is not configured for Invoice4U" },
      400,
    );
  }

  // INVOICE4U_LIVE_VERIFY lets this read-only check reach the real API while charges
  // stay mocked. Without it, confirming a QA key or watching for the terminal to be
  // enabled would mean unsetting INVOICE4U_MOCK — which arms live charging everywhere.
  // IsAuthenticated and GetClearingAccount move no money.
  const liveVerify = getEnv("INVOICE4U_LIVE_VERIFY") === "true";

  if (getEnv("INVOICE4U_MOCK") === "true" && !liveVerify) {
    const provider = new MockInvoice4uPaymentProvider(service);
    const health = await provider.verifyCredentials(tenantId);
    return jsonResponse(
      { ok: health.valid, provider: "invoice4u", ...health },
      health.valid ? 200 : 502,
    );
  }

  const provider = new Invoice4uPaymentProvider(service);
  try {
    const health = await provider.verifyCredentials(tenantId);
    if (!health.valid) {
      return jsonResponse({ ok: false, provider: "invoice4u", ...health }, 502);
    }

    // Auth alone is not enough to take a payment: the terminal must also have
    // tokenization (309) and standing orders (310) enabled. Reported here so the
    // admin screen answers "can we actually charge yet?", not just "is the key valid?".
    let capabilities = null;
    let capabilityError: string | null = null;
    try {
      capabilities = await provider.getTerminalCapabilities(tenantId);
    } catch (err) {
      capabilityError = err instanceof Error ? err.message : String(err);
    }

    return jsonResponse({
      ok: true,
      provider: "invoice4u",
      ...health,
      capabilities,
      capabilityError,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        valid: false,
        provider: "invoice4u",
        message: err instanceof Error ? err.message : "Invoice4U verify not available",
      },
      502,
    );
  }
});
