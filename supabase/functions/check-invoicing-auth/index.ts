import { jsonResponse } from "../_shared/edge-runtime/cors.ts";
import { rejectUnlessCron } from "../_shared/edge-runtime/cron-auth.ts";
import { createServiceClient } from "../_shared/edge-runtime/supabase.ts";
import { getInvoicingProviderForTenant } from "../_shared/invoicing/index.ts";
import { withMonitoring } from "../_shared/monitoring.ts";

const BATCH_LIMIT = 20;

Deno.serve(withMonitoring("check-invoicing-auth", async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const denied = rejectUnlessCron(req);
  if (denied) return denied;

  const service = createServiceClient();
  const { data: tenants } = await service
    .from("tenants")
    .select("id, invoicing_account_id, from_email, name")
    .not("invoicing_account_id", "is", null)
    .limit(BATCH_LIMIT);

  let checked = 0;
  let warnings = 0;

  for (const tenant of tenants ?? []) {
    checked += 1;
    const provider = await getInvoicingProviderForTenant(service, tenant.id as string);
    const health = provider.checkAuthHealth
      ? await provider.checkAuthHealth(service, tenant.id as string)
      : { valid: true };

    if (!health.valid) {
      warnings += 1;
      console.warn("[check-invoicing-auth] invalid", tenant.id, health.message);
    }

    if (health.validUntil) {
      const expires = new Date(health.validUntil);
      const daysLeft = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      if (daysLeft <= 14 && tenant.from_email) {
        warnings += 1;
        console.warn("[check-invoicing-auth] expiring soon", tenant.id, daysLeft);
      }
    }
  }

  return jsonResponse({ ok: true, checked, warnings });
}));
