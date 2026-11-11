import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideSupportSession, jwtAal, supportLoginEmail } from "./decide.ts";

const OWNER = { roles: ["super_admin"], isSupportLogin: false, studioExists: true, hasVerifiedFactor: false, aal: "aal1" };

Deno.test("only the platform owner may open a studio's support login", () => {
  assertEquals(decideSupportSession(OWNER), { ok: true });
  assertEquals(decideSupportSession({ ...OWNER, roles: ["tenant_admin"] }).ok, false);
  assertEquals(decideSupportSession({ ...OWNER, roles: [] }).ok, false);
  // A support login can never open another one.
  assertEquals(decideSupportSession({ ...OWNER, roles: ["tenant_admin"], isSupportLogin: true }).ok, false);
});

Deno.test("an owner with two-step sign-in must have passed it", () => {
  assertEquals(decideSupportSession({ ...OWNER, hasVerifiedFactor: true, aal: "aal1" }), {
    ok: false,
    status: 403,
    error: "two_step_required",
  });
  assertEquals(decideSupportSession({ ...OWNER, hasVerifiedFactor: true, aal: null }).ok, false);
  assertEquals(decideSupportSession({ ...OWNER, hasVerifiedFactor: true, aal: "aal2" }), { ok: true });
});

Deno.test("an unknown studio is refused", () => {
  assertEquals(decideSupportSession({ ...OWNER, studioExists: false }), { ok: false, status: 404, error: "studio not found" });
});

Deno.test("support login address: one per studio, on OpalSwift's own domain", () => {
  assertEquals(
    supportLoginEmail("0A1B2C3D-0000-4000-8000-00000000ABCD"),
    "support+0a1b2c3d00004000800000000000abcd@opalswift.com",
  );
});

Deno.test("jwtAal reads the aal claim, and nothing from a broken token", () => {
  const payload = btoa(JSON.stringify({ sub: "u", aal: "aal2" })).replace(/=+$/, "");
  assertEquals(jwtAal(`Bearer x.${payload}.y`), "aal2");
  assertEquals(jwtAal("Bearer not-a-jwt"), null);
  assertEquals(jwtAal("Bearer a.%%%.c"), null);
});
