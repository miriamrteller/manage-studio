import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import type { TakbullCredentials } from "./client.ts";

/** Thrown when a studio has no Takbull keys saved (not a Takbull fault). */
export class TakbullNotConnectedError extends Error {
  constructor() {
    // "not configured": checkout treats this as "online payment not set up" (pay at the studio).
    super("Takbull credentials not configured for this studio");
    this.name = "TakbullNotConnectedError";
  }
}

/**
 * The studio's own Takbull keys: tenants.takbull_api_key and the decrypted secret, through
 * get_tenant_takbull_credentials (service role only). Never logged.
 */
export async function getTakbullCredentials(
  service: SupabaseClient,
  tenantId: string,
): Promise<TakbullCredentials> {
  const { data, error } = await service.rpc("get_tenant_takbull_credentials", { p_tenant_id: tenantId });
  const row = (data as Array<{ api_key: string | null; api_secret: string | null }> | null)?.[0];
  if (error || !row?.api_key?.trim() || !row?.api_secret?.trim()) throw new TakbullNotConnectedError();
  return { apiKey: row.api_key.trim(), apiSecret: row.api_secret.trim() };
}

/** Thrown when OpalSwift's own Takbull keys (Platform → Billing) are not saved. */
export class PlatformTakbullNotConnectedError extends Error {
  constructor() {
    super("OpalSwift's own Takbull keys are not saved");
    this.name = "PlatformTakbullNotConnectedError";
  }
}

/**
 * OpalSwift's own Takbull keys, used to bill studios (and later to open their accounts),
 * through get_platform_takbull_credentials (service role only). Never logged.
 */
export async function getPlatformTakbullCredentials(service: SupabaseClient): Promise<TakbullCredentials> {
  const { data, error } = await service.rpc("get_platform_takbull_credentials");
  const row = (data as Array<{ api_key: string | null; api_secret: string | null }> | null)?.[0];
  if (error || !row?.api_key?.trim() || !row?.api_secret?.trim()) throw new PlatformTakbullNotConnectedError();
  return { apiKey: row.api_key.trim(), apiSecret: row.api_secret.trim() };
}
