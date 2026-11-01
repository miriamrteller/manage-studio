import { assertEquals } from "jsr:@std/assert@^1";
import { buildTermsAcceptancePatch, resolveTermsAcceptedVia } from "./enrolment-terms.ts";
import { resolveTermsContext } from "./enrolment-completion-context.ts";

Deno.test("who accepted: admin attests, parent signs in, guest uses the link", () => {
  assertEquals(resolveTermsAcceptedVia({ authUserId: "u", isTenantAdmin: true, tokenEmail: null }), "admin_attested");
  assertEquals(resolveTermsAcceptedVia({ authUserId: "u", isTenantAdmin: false, tokenEmail: null }), "parent");
  assertEquals(resolveTermsAcceptedVia({ authUserId: null, isTenantAdmin: false, tokenEmail: "p@x.il" }), "guest_link");
});

Deno.test("acceptance patch stores version, time and who", () => {
  const patch = buildTermsAcceptancePatch({
    via: "guest_link",
    version: "2026-11",
    authUserId: null,
    tokenEmail: "p@x.il",
    acceptedAt: "2026-11-01T00:00:00.000Z",
  });
  assertEquals(patch.terms_version, "2026-11");
  assertEquals(patch.terms_accepted_by_email, "p@x.il");
  assertEquals(patch.terms_accepted_via, "guest_link");
});

Deno.test("terms are required only for class enrolments of studios with a terms URL", () => {
  const base = { privacyUrl: null, termsVersion: "1", acceptedAt: null, acceptedVersion: null };
  assertEquals(resolveTermsContext({ ...base, termsUrl: "https://x/terms", isAppointment: false }).termsRequired, true);
  assertEquals(resolveTermsContext({ ...base, termsUrl: "https://x/terms", isAppointment: true }).termsRequired, false);
  assertEquals(resolveTermsContext({ ...base, termsUrl: null, isAppointment: false }).termsRequired, false);
  assertEquals(resolveTermsContext({ ...base, termsUrl: " ", isAppointment: false }).termsRequired, false);
  assertEquals(
    resolveTermsContext({ ...base, termsUrl: "https://x/terms", acceptedAt: "2026-11-01T00:00:00Z", isAppointment: false }).termsAccepted,
    true,
  );
});
