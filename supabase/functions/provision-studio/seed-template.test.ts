/**
 * Every new studio gets the form its clients sign, at creation (provision-studio).
 * Run: cd supabase/functions && deno test --allow-env provision-studio/seed-template.test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { seedSignedTemplate, sha256Hex, type SeedDeps, type SeedTenant } from "../_shared/signed-template-seed.ts";

type Row = Parameters<SeedDeps["insertTemplate"]>[0];

function fakeDeps(existing: string[] = []) {
  const rows: Row[] = [];
  const deps: SeedDeps = {
    hasTemplate: (id) => Promise.resolve(existing.includes(id) || rows.some((r) => r.tenant_id === id)),
    insertTemplate: (row) => {
      rows.push(row);
      return Promise.resolve();
    },
  };
  return { deps, rows };
}

const studio = (skin: string, lang = "en"): SeedTenant => ({
  id: `t-${skin}`,
  name: "Harbour Studio",
  skin,
  language_default: lang,
  contact_email: "owner@harbour.test",
  legal_profile: {},
});

Deno.test("a new dance studio gets an active health declaration, filled with its name", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), true);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].name, "Health declaration");
  assertEquals(rows[0].status, "active");
  assertEquals(rows[0].version, 1);
  assertStringIncludes(rows[0].content, "Harbour Studio");
  assert(!rows[0].content.includes("[["), "no placeholders left");
  assertEquals(rows[0].version_hash, await sha256Hex(rows[0].content));
});

Deno.test("a new photographer gets the shoot agreement, with its merge fields kept", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("photographer")), true);
  assertEquals(rows[0].name, "Photography services agreement");
  assertStringIncludes(rows[0].content, "{{client_name}}");
});

Deno.test("in the studio's language", async () => {
  const { deps, rows } = fakeDeps();
  await seedSignedTemplate(deps, studio("dance-studio", "he"));
  assertEquals(rows[0].name, "הצהרת בריאות");
});

Deno.test("other studio types sign nothing; an existing form is never replaced", async () => {
  const { deps, rows } = fakeDeps(["t-dance-studio"]);
  assertEquals(await seedSignedTemplate(deps, studio("generic")), false);
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), false);
  assertEquals(rows.length, 0);
});
