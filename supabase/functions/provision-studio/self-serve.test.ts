/**
 * provision-studio, action "self_serve": who may create their own studio.
 * Run: cd supabase/functions && deno test --allow-env provision-studio/self-serve.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SelfServeStudioSchema,
  selfServeRefusalFor,
  selfServeStudio,
  type SelfServeDeps,
} from "../_shared/provision-studio.ts";

const input = SelfServeStudioSchema.parse({
  name: "Harbour Yoga",
  subdomain: "Harbour-Yoga",
  plan: "essential",
  vertical: "generic",
  paymentProvider: "grow",
  invoicingProvider: "grow",
  termsVersion: "v1",
  termsLanguage: "en",
});
const confirmed = { id: "u-1", email_confirmed_at: "2026-11-02T09:00:00Z" };

function deps(overrides: Partial<SelfServeDeps> = {}): SelfServeDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    enabled: true,
    verifyCaptcha: null,
    createStudio(userId) {
      calls.push(userId);
      return Promise.resolve("t-new");
    },
    ...overrides,
  };
}

Deno.test("creates the studio for a confirmed account (address lower-cased, English and OpalSwift colours by default)", async () => {
  const d = deps();
  assertEquals(await selfServeStudio(d, confirmed, input), { ok: true, tenantId: "t-new", subdomain: "harbour-yoga" });
  assertEquals(d.calls, ["u-1"]);
  assertEquals([input.languageDefault, input.primaryColor, input.accentColor], ["en", "#5B6CFF", "#21D1C2"]);
});

Deno.test("refused while the project has not switched it on", async () => {
  const d = deps({ enabled: false });
  assertEquals(await selfServeStudio(d, confirmed, input), { ok: false, error: "self_serve_disabled" });
  assertEquals(d.calls, []);
});

Deno.test("an unconfirmed email cannot create a studio", async () => {
  const d = deps();
  assertEquals(await selfServeStudio(d, { id: "u-1", email_confirmed_at: null }, input), {
    ok: false,
    error: "email_not_confirmed",
  });
  assertEquals(d.calls, []);
});

Deno.test("with Turnstile on, a missing or failed token is refused", async () => {
  const d = deps({ verifyCaptcha: (token) => Promise.resolve(token === "good") });
  assertEquals(await selfServeStudio(d, confirmed, input), { ok: false, error: "captcha_failed" });
  assertEquals(await selfServeStudio(d, confirmed, { ...input, captchaToken: "bad" }), { ok: false, error: "captcha_failed" });
  assertEquals((await selfServeStudio(d, confirmed, { ...input, captchaToken: "good" })).ok, true);
});

Deno.test("database refusals become plain codes", async () => {
  for (const [message, code] of [
    ["account_has_studio", "account_has_studio"],
    ["email_not_confirmed", "email_not_confirmed"],
    ["Subdomain is reserved: billing", "subdomain_unavailable"],
    ["Subdomain already taken: harbour", "subdomain_unavailable"],
    ['duplicate key value violates unique constraint "tenants_subdomain_key"', "subdomain_unavailable"],
  ] as const) {
    assertEquals(selfServeRefusalFor(message), code);
    const d = deps({ createStudio: () => Promise.reject(new Error(message)) });
    assertEquals(await selfServeStudio(d, confirmed, input), { ok: false, error: code });
  }
  const d = deps({ createStudio: () => Promise.reject(new Error("Unknown or inactive vertical: x")) });
  assertEquals(await selfServeStudio(d, confirmed, input), {
    ok: false,
    error: "invalid",
    message: "Unknown or inactive vertical: x",
  });
});

Deno.test("the request carries no owner email and needs the terms version", () => {
  assertEquals(SelfServeStudioSchema.safeParse({ ...input, termsVersion: "" }).success, false);
  assertEquals("ownerEmail" in input, false);
  assertEquals(SelfServeStudioSchema.safeParse({ ...input, paymentProvider: "mock" }).success, false);
});

Deno.test("a request without a business profile starts general: both payment flows, every switch off", () => {
  assertEquals(input.profile, {
    paymentFlow: "both",
    teachesClasses: false,
    familyAccounts: false,
    clientBooking: false,
  });
});

Deno.test("the business profile the wizard sends is stored on the new studio", async () => {
  const stored: unknown[] = [];
  const chosen = SelfServeStudioSchema.parse({
    ...input,
    profile: { paymentFlow: "recurring", teachesClasses: true, familyAccounts: true },
  });
  const d = deps({
    applyProfile(tenantId, profile) {
      stored.push([tenantId, profile]);
      return Promise.resolve();
    },
  });
  assertEquals((await selfServeStudio(d, confirmed, chosen)).ok, true);
  assertEquals(stored, [
    ["t-new", { paymentFlow: "recurring", teachesClasses: true, familyAccounts: true, clientBooking: false }],
  ]);
});

Deno.test("a profile that cannot be stored never fails the signup (the studio exists; Settings can change it)", async () => {
  const d = deps({ applyProfile: () => Promise.reject(new Error("db down")) });
  assertEquals(await selfServeStudio(d, confirmed, input), { ok: true, tenantId: "t-new", subdomain: "harbour-yoga" });
});

Deno.test("an unknown payment flow is rejected", () => {
  assertEquals(SelfServeStudioSchema.safeParse({ ...input, profile: { paymentFlow: "weekly" } }).success, false);
});

Deno.test("the business address and phone from the first wizard screen are stored; blank ones are not", async () => {
  const stored: unknown[] = [];
  const withContact = SelfServeStudioSchema.parse({ ...input, contact: { address: " 12 Herzl St, Haifa ", phone: "04-1234567" } });
  const d = deps({
    applyContact(tenantId, contact) {
      stored.push([tenantId, contact]);
      return Promise.resolve();
    },
  });
  assertEquals((await selfServeStudio(d, confirmed, withContact)).ok, true);
  assertEquals(stored, [["t-new", { address: "12 Herzl St, Haifa", phone: "04-1234567" }]]);

  stored.length = 0;
  assertEquals((await selfServeStudio(d, confirmed, input)).ok, true); // no contact given
  assertEquals(stored, []);
});

Deno.test("a contact that cannot be stored never fails the signup", async () => {
  const withContact = SelfServeStudioSchema.parse({ ...input, contact: { phone: "04-1234567" } });
  const d = deps({ applyContact: () => Promise.reject(new Error("db down")) });
  assertEquals((await selfServeStudio(d, confirmed, withContact)).ok, true);
});

Deno.test("the business email (clients see this) is stored with the contact; a bad one is refused", async () => {
  const stored: unknown[] = [];
  const withEmail = SelfServeStudioSchema.parse({ ...input, contact: { email: " Hello@Lumen.Studio " } });
  const d = deps({
    applyContact(tenantId, contact) {
      stored.push([tenantId, contact]);
      return Promise.resolve();
    },
  });
  assertEquals((await selfServeStudio(d, confirmed, withEmail)).ok, true);
  assertEquals(stored, [["t-new", { email: "hello@lumen.studio" }]]);
  assertEquals(SelfServeStudioSchema.safeParse({ ...input, contact: { email: "not-an-email" } }).success, false);
});
