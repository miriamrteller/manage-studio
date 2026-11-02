/**
 * crm-lead-capture guards: Turnstile gate and campaign tag.
 * Run: cd supabase/functions && deno test crm-lead-capture/guard.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CAMPAIGN_MAX_LENGTH,
  leadCaptchaPasses,
  normaliseCampaign,
} from "../_shared/crm-contract/lead-capture-guard.ts";

const yes = () => Promise.resolve(true);
const no = () => Promise.resolve(false);

Deno.test("no secret configured: passes without a token (CAPTCHA off)", async () => {
  assertEquals(await leadCaptchaPasses({ secret: null, token: null, verify: no }), true);
  assertEquals(await leadCaptchaPasses({ secret: "  ", token: undefined, verify: no }), true);
});

Deno.test("secret configured: a missing token is refused without calling Cloudflare", async () => {
  let called = false;
  const verify = () => {
    called = true;
    return Promise.resolve(true);
  };
  assertEquals(await leadCaptchaPasses({ secret: "s", token: null, verify }), false);
  assertEquals(await leadCaptchaPasses({ secret: "s", token: " ", verify }), false);
  assertEquals(called, false);
});

Deno.test("secret configured: the verifier decides", async () => {
  assertEquals(await leadCaptchaPasses({ secret: "s", token: "t", verify: yes }), true);
  assertEquals(await leadCaptchaPasses({ secret: "s", token: "t", verify: no }), false);
});

Deno.test("a verifier that throws counts as a failed check", async () => {
  const verify = () => Promise.reject(new Error("network"));
  assertEquals(await leadCaptchaPasses({ secret: "s", token: "t", verify }), false);
});

Deno.test("campaign: trimmed, whitespace collapsed, control chars removed, empty is null", () => {
  assertEquals(normaliseCampaign("  Spring Open Day  "), "Spring Open Day");
  assertEquals(normaliseCampaign("a\tb\nc"), "a b c");
  assertEquals(normaliseCampaign("   "), null);
  assertEquals(normaliseCampaign(null), null);
  assertEquals(normaliseCampaign(undefined), null);
  assertEquals(normaliseCampaign("x".repeat(500))?.length, CAMPAIGN_MAX_LENGTH);
});
