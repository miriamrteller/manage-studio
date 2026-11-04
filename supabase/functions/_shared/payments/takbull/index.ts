import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { TakbullClient, type TakbullApi } from "./client.ts";
import { getTakbullCredentials } from "./credentials.ts";
import { MockTakbullApi } from "./mock.ts";

function envFlag(name: string): boolean {
  return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(name) === "true";
}

/**
 * The studio's Takbull account: the live client with its own keys, or the in-memory mock
 * when TAKBULL_MOCK=true (tests and dev only). Throws TakbullNotConnectedError when the
 * studio has no keys saved.
 */
export async function takbullApiForTenant(service: SupabaseClient, tenantId: string): Promise<TakbullApi> {
  const credentials = await getTakbullCredentials(service, tenantId);
  if (envFlag("TAKBULL_MOCK")) return new MockTakbullApi(credentials.apiKey);
  return new TakbullClient({ credentials });
}
