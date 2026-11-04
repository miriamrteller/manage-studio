import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { parsePending, type SmugMugKeys, type SmugMugPending, type SmugMugToken } from "./oauth.ts";

export interface StudioSmugMug {
  keys: SmugMugKeys;
  /** Null until "Connect SmugMug" has finished. */
  token: SmugMugToken | null;
  pending: SmugMugPending | null;
}

/**
 * The studio's own SmugMug keys and token, decrypted by get_tenant_smugmug_credentials
 * (service role only). Null when no keys are saved. Never logged.
 */
export async function getStudioSmugMug(service: SupabaseClient, tenantId: string): Promise<StudioSmugMug | null> {
  const { data, error } = await service.rpc("get_tenant_smugmug_credentials", { p_tenant_id: tenantId });
  if (error) throw new Error("Could not read the studio's SmugMug keys");
  const row = (data as Array<{
    api_key: string | null;
    api_secret: string | null;
    access_token: string | null;
    access_secret: string | null;
    oauth_pending: string | null;
  }> | null)?.[0];
  if (!row?.api_key?.trim() || !row?.api_secret?.trim()) return null;
  const token = row.access_token?.trim() && row.access_secret?.trim()
    ? { token: row.access_token.trim(), secret: row.access_secret.trim() }
    : null;
  return {
    keys: { apiKey: row.api_key.trim(), apiSecret: row.api_secret.trim() },
    token,
    pending: parsePending(row.oauth_pending),
  };
}
