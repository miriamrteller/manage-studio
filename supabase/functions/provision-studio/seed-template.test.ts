/**
 * Every new studio gets the forms its clients sign, at creation (provision-studio).
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

function checkFilled(row: Row) {
  assertEquals(row.status, "active");
  assertEquals(row.version, 1);
  assertStringIncludes(row.content, "Harbour Studio");
  assert(!row.content.includes("[["), `no placeholders left in ${row.name}`);
}

Deno.test("a new dance studio gets both health declarations, by audience, filled with its name", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), 2);
  assertEquals(rows.map((r) => [r.name, r.audience]), [
    ["Health declaration (under 18)", "child"],
    ["Health declaration (adults)", "adult"],
  ]);
  for (const row of rows) {
    checkFilled(row);
    assertEquals(row.version_hash, await sha256Hex(row.content));
  }
});

Deno.test("a new photographer gets one agreement with the photography add-on, merge fields kept", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("photographer")), 1);
  assertEquals(rows[0].name, "Photography services agreement");
  assertEquals(rows[0].audience, null);
  assertStringIncludes(rows[0].content, "{{client_name}}");
  checkFilled(rows[0]);
});

Deno.test("a beautician gets the agreement with its add-on; a general studio the base agreement", async () => {
  const beauty = fakeDeps();
  assertEquals(await seedSignedTemplate(beauty.deps, studio("beautician")), 1);
  assertEquals(beauty.rows[0].name, "Treatment services agreement");
  checkFilled(beauty.rows[0]);

  const generic = fakeDeps();
  assertEquals(await seedSignedTemplate(generic.deps, studio("generic")), 1);
  assertEquals(generic.rows[0].name, "Service agreement");
  checkFilled(generic.rows[0]);
  assert(beauty.rows[0].content.length > generic.rows[0].content.length, "the add-on is appended");
});

Deno.test("in the studio's language", async () => {
  const { deps, rows } = fakeDeps();
  await seedSignedTemplate(deps, studio("dance-studio", "he"));
  assertEquals(rows.map((r) => r.name), ["הצהרת בריאות (מתחת לגיל 18)", "הצהרת בריאות (מבוגרים)"]);
});

Deno.test("an existing form is never replaced", async () => {
  const { deps, rows } = fakeDeps(["t-dance-studio", "t-generic"]);
  assertEquals(await seedSignedTemplate(deps, studio("generic")), 0);
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), 0);
  assertEquals(rows.length, 0);
});
