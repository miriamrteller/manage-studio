import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { EXTRAS_FEATURE_KEYS, requireFeature } from "./feature-gate.ts";

/** A fake client whose get_tenant_features RPC fails or returns the given keys. */
function fakeClient(result: string[] | "error"): SupabaseClient {
  return {
    rpc: () =>
      Promise.resolve(result === "error" ? { data: null, error: { message: "down" } } : { data: result, error: null }),
  } as unknown as SupabaseClient;
}

async function status(tenantId: string, key: string, client: SupabaseClient): Promise<number> {
  try {
    await requireFeature(tenantId, key, client);
    return 200;
  } catch (err) {
    if (err instanceof Response) return err.status;
    throw err;
  }
}

Deno.test("features unavailable: EXTRAS fail closed, everything else is let through", async () => {
  const client = fakeClient("error");
  assertEquals(EXTRAS_FEATURE_KEYS.has("finance:export.bkmv"), true);
  assertEquals(await status("t-down-1", "finance:export.bkmv", client), 503);
  assertEquals(await status("t-down-2", "scheduling:booking.client", client), 200);
  assertEquals(await status("t-down-3", "people:contacts.manage", client), 200);
});

Deno.test("features read: a key the studio does not have is refused, one it has is allowed", async () => {
  const client = fakeClient(["scheduling:booking.client"]);
  assertEquals(await status("t-ok", "scheduling:booking.client", client), 200);
  assertEquals(await status("t-ok", "finance:export.bkmv", client), 403);
  assertEquals(await status("t-ok", "scheduling:integration.google_calendar", client), 403);
});
