/**
 * send-auth-email: which email each auth action gets.
 * Run: cd supabase/functions && deno test --allow-env --allow-read send-auth-email/compose.test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { composeAuthEmail } from "./compose.ts";
import { renderAuthMagicLinkHtml } from "../_shared/render-auth-email.ts";
import type { TenantEmailConfig } from "../_shared/tenant-email.ts";

const studio: TenantEmailConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Harbour Yoga",
  subdomain: "harbour",
  language: "en",
  primary_color: "#76335a",
  accent_color: "#e99ac4",
};
const link = "https://harbour.opalswift.com/auth/callback?token_hash=abc&type=invite";
const studioUrl = "https://harbour.opalswift.com";

Deno.test("invite: OpalSwift welcome with the studio's name, address and link, Reply-To hello@", () => {
  const msg = composeAuthEmail({ action: "invite", tenant: studio, confirmationUrl: link, strings: {}, studioUrl });
  assertEquals(msg.subject, "Your studio Harbour Yoga is ready on OpalSwift");
  assertEquals(msg.replyTo, "hello@opalswift.com");
  assertStringIncludes(msg.html, "Set up your account");
  assertStringIncludes(msg.html, "Harbour Yoga");
  assertStringIncludes(msg.html, `href="${studioUrl}"`);
  assertStringIncludes(msg.html, link.replace(/&/g, "&amp;"));
  assertStringIncludes(msg.html, `${studioUrl}/opalswift-gem.png`);
  assertStringIncludes(msg.html, "#4A58E8");
  assertStringIncludes(msg.html, "Questions? Just reply to this email.");
  assertStringIncludes(msg.html, 'dir="ltr"');
  assert(!msg.html.includes("{{"), "every placeholder is filled in");
  assert(!msg.html.includes("Please do not reply"), "no 'do not reply' footer");
  for (const word of ["dance", "dancer", "ballet", "health declaration"]) {
    assert(!msg.html.toLowerCase().includes(word), `no dance wording: ${word}`);
  }
});

Deno.test("invite in Hebrew: Hebrew subject and right-to-left", () => {
  const msg = composeAuthEmail({
    action: "invite",
    tenant: { ...studio, language: "he" },
    confirmationUrl: link,
    strings: {},
    studioUrl,
  });
  assertEquals(msg.subject, "הסטודיו שלך Harbour Yoga מוכן ב-OpalSwift");
  assertStringIncludes(msg.html, 'dir="rtl"');
  assertStringIncludes(msg.html, 'lang="he"');
  assertStringIncludes(msg.html, "הגדרת החשבון");
  assertEquals(msg.replyTo, "hello@opalswift.com");
});

Deno.test("invite: the studio name is escaped in the HTML", () => {
  const msg = composeAuthEmail({
    action: "invite",
    tenant: { ...studio, name: "A&B <Studio>" },
    confirmationUrl: link,
    strings: {},
    studioUrl,
  });
  assertStringIncludes(msg.html, "A&amp;B &lt;Studio&gt;");
  assert(!msg.html.includes("<Studio>"));
  assertEquals(msg.subject, "Your studio A&B <Studio> is ready on OpalSwift");
});

Deno.test("magic link: unchanged (studio shell, studio subject, no Reply-To)", () => {
  const msg = composeAuthEmail({
    action: "magiclink",
    tenant: studio,
    confirmationUrl: link,
    otpCode: "654321",
    strings: {},
    studioUrl,
  });
  assertEquals(msg.subject, "Sign in to Harbour Yoga");
  assertEquals(msg.replyTo, undefined);
  assertEquals(
    msg.html,
    renderAuthMagicLinkHtml({
      language: "en",
      schoolName: "Harbour Yoga",
      magicLinkUrl: link,
      otpCode: "654321",
      primaryColor: studio.primary_color,
      accentColor: studio.accent_color,
    }),
  );
  assert(!msg.html.includes("Set up your account"));
});

Deno.test("invite without a studio (platform host) keeps the plain invite", () => {
  const msg = composeAuthEmail({
    action: "invite",
    tenant: { ...studio, id: "", name: "OpalSwift", subdomain: "" },
    confirmationUrl: link,
    strings: {},
    studioUrl: null,
  });
  assertEquals(msg.subject, "You've been invited to OpalSwift");
  assertEquals(msg.replyTo, undefined);
});
