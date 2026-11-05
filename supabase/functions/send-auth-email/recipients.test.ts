/**
 * send-auth-email: who gets which email and token. Email change follows Supabase's
 * (reversed) mapping: current address ← token + token_hash_new; new address ← token_new + token_hash.
 * Run: cd supabase/functions && deno test send-auth-email/recipients.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authEmailRecipients } from "./recipients.ts";
import { composeLoginEmailChangedNotice } from "./compose.ts";
import type { TenantEmailConfig } from "../_shared/tenant-email.ts";

const base = { token: "111111", token_hash: "hash-a", email_action_type: "magiclink" };

Deno.test("sign-in emails: one email to the account, with token_hash", () => {
  assertEquals(authEmailRecipients({ email: "a@x.test" }, base), [{ to: "a@x.test", tokenHash: "hash-a", token: "111111" }]);
});

Deno.test("secure email change: both addresses confirm, each with its own pair", () => {
  const data = { ...base, email_action_type: "email_change", token: "111111", token_hash: "hash-for-new", token_new: "222222", token_hash_new: "hash-for-current" };
  assertEquals(authEmailRecipients({ email: "old@x.test", new_email: "new@x.test" }, data), [
    { to: "old@x.test", tokenHash: "hash-for-current", token: "111111" },
    { to: "new@x.test", tokenHash: "hash-for-new", token: "222222" },
  ]);
});

Deno.test("email change without secure change: one email, to the new address", () => {
  const data = { ...base, email_action_type: "email_change", token: "", token_hash: "hash-for-new", token_new: "333333", token_hash_new: "" };
  assertEquals(authEmailRecipients({ email: "old@x.test", new_email: "new@x.test" }, data), [
    { to: "new@x.test", tokenHash: "hash-for-new", token: "333333" },
  ]);
});

Deno.test("after the change: a notice (no link) to the old address", () => {
  const data = { ...base, email_action_type: "email_changed_notification", token: "", token_hash: "", old_email: "old@x.test" };
  assertEquals(authEmailRecipients({ email: "new@x.test" }, data), [{ to: "old@x.test", tokenHash: "" }]);
  const tenant: TenantEmailConfig = { id: "t", name: "Lumen <Studio>", subdomain: "lumen", language: "en", primary_color: "#000000", accent_color: "#ffffff" };
  const msg = composeLoginEmailChangedNotice({ tenant, newEmail: "new@x.test" });
  assertEquals(msg.subject, "Your login email was changed — Lumen <Studio>");
  assertEquals(msg.html.includes("Lumen &lt;Studio&gt;"), true);
  assertEquals(msg.html.includes("If this wasn't you, contact OpalSwift"), true);
  assertEquals(msg.html.includes("<a href=\"http"), false);
  const he = composeLoginEmailChangedNotice({ tenant: { ...tenant, language: "he" }, newEmail: "new@x.test" });
  assertEquals(he.html.includes('dir="rtl"'), true);
});
