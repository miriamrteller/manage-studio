// Run: cd supabase/functions && deno test --allow-env _shared/google-oauth-state.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("GOOGLE_CALENDAR_CLIENT_SECRET", "test-secret");
const { signGoogleOAuthState, verifyGoogleOAuthState, googleOAuthStateTenant } = await import(
  "./google-oauth-state.ts"
);

Deno.test("googleOAuthStateTenant: a signed state names its studio", async () => {
  const state = await signGoogleOAuthState("tenant-1", "user-1");
  assertEquals(await googleOAuthStateTenant(state), "tenant-1");
});

Deno.test("googleOAuthStateTenant: a changed state is refused", async () => {
  const state = await signGoogleOAuthState("tenant-1", "user-1");
  const [, sig] = state.split(".");
  const forged = btoa(JSON.stringify({ tid: "tenant-2", uid: "user-1", exp: 9999999999, n: "x" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  assertEquals(await googleOAuthStateTenant(`${forged}.${sig}`), null);
  assertEquals(await googleOAuthStateTenant("garbage"), null);
});

Deno.test("verifyGoogleOAuthState still binds studio and admin", async () => {
  const state = await signGoogleOAuthState("tenant-1", "user-1");
  assertEquals((await verifyGoogleOAuthState(state, "tenant-1", "user-1"))?.tid, "tenant-1");
  assertEquals(await verifyGoogleOAuthState(state, "tenant-2", "user-1"), null);
  assertEquals(await verifyGoogleOAuthState(state, "tenant-1", "user-2"), null);
});
