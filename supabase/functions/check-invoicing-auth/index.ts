import { jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { getInvoicingProviderForTenant } from "../_shared/invoicing/index.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const BATCH_LIMIT = 20;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    if (authHeader !== `Bearer ${CRON_SECRET}` && cronHeader !== CRON_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

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
});
