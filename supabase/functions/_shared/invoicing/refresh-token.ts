import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { GreenInvoiceProvider } from "./providers/green-invoice.ts";
import { InvoicingProviderError } from "./types.ts";

/** Return cached bearer token or refresh via Green Invoice auth. */
export async function refreshInvoicingToken(
  service: SupabaseClient,
  tenantId: string,
  provider: GreenInvoiceProvider,
): Promise<string> {
  const now = new Date();

  const { data: cached } = await service
    .from("invoicing_token_cache")
    .select("token, expires_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (
    cached?.token &&
    cached.expires_at &&
    new Date(cached.expires_at as string) > now
  ) {
    return cached.token as string;
  }

  const { token, expiresAt } = await provider.fetchToken(service, tenantId);

  const { error: upsertError } = await service.from("invoicing_token_cache").upsert({
    tenant_id: tenantId,
    token,
    expires_at: expiresAt,
  });
  if (upsertError) {
    throw new InvoicingProviderError(`Token cache upsert failed: ${upsertError.message}`, {
      retryable: true,
    });
  }

  await service
    .from("tenants")
    .update({
      invoicing_auth_valid_until: expiresAt,
      invoicing_auth_checked_at: now.toISOString(),
    })
    .eq("id", tenantId);

  return token;
}
