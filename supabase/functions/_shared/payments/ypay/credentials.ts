import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import type { YpayCredentials } from "./client.ts";

/**
 * Reads a tenant's YPay credentials.
 *
 * client_id lives in payment_provider_public_key (plaintext identifier); client_secret
 * is decrypted by get_tenant_payment_credentials (same RPC Grow/Invoice4U use).
 */
export async function getYpayCredentials(
  service: SupabaseClient,
  tenantId: string,
): Promise<YpayCredentials> {
  const { data: creds, error } = await service.rpc("get_tenant_payment_credentials", {
    p_tenant_id: tenantId,
  });
  if (error || !creds?.[0]?.payment_provider_secret_key) {
    throw new Error("YPay credentials not configured");
  }

  const cred = creds[0] as {
    payment_provider_public_key: string | null;
    payment_provider_secret_key: string;
  };

  const clientId = cred.payment_provider_public_key?.trim();
  if (!clientId) {
    throw new Error("YPay client_id not configured");
  }

  return { clientId, clientSecret: cred.payment_provider_secret_key };
}
