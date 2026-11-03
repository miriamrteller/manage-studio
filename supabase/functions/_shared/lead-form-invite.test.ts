import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cleanInviteToken, inviteTokenHash, inviteUrl, newInviteToken } from "./lead-form-invite.ts";

Deno.test("tokens are random base64url, 43 characters", () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assertEquals(a.length, 43);
  assertEquals(/^[A-Za-z0-9_-]+$/.test(a), true);
  assertEquals(a === b, false);
});

Deno.test("only the hash is stored, and it matches Postgres sha256 (hex)", async () => {
  assertEquals(
    await inviteTokenHash("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("the token rides in the fragment; no name or email in the URL", () => {
  const url = inviteUrl("https://studio.opalswift.com/inquire?src=direct", "tok_123");
  assertEquals(url, "https://studio.opalswift.com/inquire?src=direct#invite=tok_123");
  assertEquals(url.includes("@"), false);
});

Deno.test("form-sent tokens are checked", () => {
  const t = newInviteToken();
  assertEquals(cleanInviteToken(t), t);
  assertEquals(cleanInviteToken("short"), null);
  assertEquals(cleanInviteToken("bad token with spaces and more than 32 chars"), null);
  assertEquals(cleanInviteToken(null), null);
});
