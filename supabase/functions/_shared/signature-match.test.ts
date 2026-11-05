/**
 * A signature on one language version of a form counts for the other language
 * version while it is current; a changed form or another audience needs a new one.
 * Run: cd supabase/functions && deno test _shared/signature-match.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readerLanguage, signatureMatchesActiveForm } from "./studio-legal.ts";

const activeEn = { id: "en-child", version: 1, audience: "child" as const };

Deno.test("the same row and version counts", () => {
  assertEquals(signatureMatchesActiveForm(activeEn, { id: "en-child", version: 1, status: "active", audience: "child" }, 1), true);
});

Deno.test("an older version of the same row does not", () => {
  assertEquals(signatureMatchesActiveForm({ ...activeEn, version: 2 }, { id: "en-child", version: 2, status: "active", audience: "child" }, 1), false);
});

Deno.test("the other language version counts while it is active and for the same audience", () => {
  const he = { id: "he-child", version: 1, status: "active", audience: "child" };
  assertEquals(signatureMatchesActiveForm(activeEn, he, 1), true);
  assertEquals(signatureMatchesActiveForm(activeEn, { ...he, status: "archived" }, 1), false);
  assertEquals(signatureMatchesActiveForm(activeEn, { ...he, audience: "adult" }, 1), false);
  assertEquals(signatureMatchesActiveForm(activeEn, { ...he, version: 2 }, 1), false);
  assertEquals(signatureMatchesActiveForm(activeEn, null, 1), false);
});

Deno.test("only he and en are reader languages", () => {
  assertEquals(readerLanguage("he"), "he");
  assertEquals(readerLanguage("en"), "en");
  assertEquals(readerLanguage("fr"), null);
  assertEquals(readerLanguage(undefined), null);
});
