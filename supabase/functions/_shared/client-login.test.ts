import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanSignInToken,
  clientSignInUrl,
  escapeLike,
  normaliseEmail,
  pickClientProfile,
} from "./client-login.ts";
import { insertBeforeParagraph, isHttpLink, signInBlockHtml } from "./sign-in-email-block.ts";

const STUDIO = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

Deno.test("no login yet: one is made", () => {
  assertEquals(pickClientProfile([], STUDIO), { kind: "none" });
});

Deno.test("the client's own login at this studio is used", () => {
  assertEquals(
    pickClientProfile([{ id: "u1", tenant_id: STUDIO, role: ["client"] }], STUDIO),
    { kind: "existing", id: "u1" },
  );
});

Deno.test("never a staff, admin or owner login, never another studio's", () => {
  for (const role of ["tenant_admin", "staff", "super_admin"]) {
    assertEquals(pickClientProfile([{ id: "u1", tenant_id: STUDIO, role: [role] }], STUDIO).kind, "refused");
  }
  assertEquals(pickClientProfile([{ id: "u1", tenant_id: OTHER, role: ["client"] }], STUDIO).kind, "refused");
  assertEquals(pickClientProfile([{ id: "u1", tenant_id: null, role: ["super_admin"] }], STUDIO).kind, "refused");
});

Deno.test("emails are matched literally and in lower case", () => {
  assertEquals(normaliseEmail("  Dana@Example.COM "), "dana@example.com");
  assertEquals(escapeLike("a_b%c@x.com"), "a\\_b\\%c@x.com");
});

Deno.test("the token rides in the fragment", () => {
  assertEquals(clientSignInUrl("https://studio.opalswift.com/", "tok"), "https://studio.opalswift.com/signin#t=tok");
  assertEquals(cleanSignInToken("x".repeat(43)), "x".repeat(43));
  assertEquals(cleanSignInToken("short"), null);
  assertEquals(cleanSignInToken("bad token with spaces and more than thirty two chars"), null);
});

Deno.test("the sign-in button goes above the closing line, or not at all", () => {
  const html = '<div><p style="a">Hello</p><p style="b">We are looking forward to it.</p></div>';
  const block = signInBlockHtml({ body: "Body", cta: "Go", url: "https://s.example/signin#t=x", color: "#123456" });
  const out = insertBeforeParagraph(html, "We are looking forward to it.", block);
  assertEquals(out.indexOf("Go</a>") < out.indexOf("We are looking"), true);
  assertEquals(out.indexOf("Hello") < out.indexOf("Go</a>"), true);
  assertEquals(insertBeforeParagraph(html, "Not there", block), html);
  assertEquals(isHttpLink("javascript:alert(1)"), false);
  assertEquals(isHttpLink("https://s.example/signin"), true);
});
