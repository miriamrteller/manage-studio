import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { isInvoicingOff } from "./registry.ts";

/** True when the tenant has invoicing switched off (tenants.invoicing_provider = 'none'). */
export async function isTenantInvoicingOff(
  service: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const { data } = await service
    .from("tenants")
    .select("invoicing_provider")
    .eq("id", tenantId)
    .maybeSingle();
  return isInvoicingOff((data?.invoicing_provider as string | null | undefined) ?? null);
}
