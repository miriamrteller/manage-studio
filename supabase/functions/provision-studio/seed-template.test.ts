/**
 * Every new studio gets the forms its clients sign, at creation (provision-studio).
 * Run: cd supabase/functions && deno test --allow-env provision-studio/seed-template.test.ts
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { seedSignedTemplate, sha256Hex, type SeedDeps, type SeedTenant } from "../_shared/signed-template-seed.ts";

type Row = Parameters<SeedDeps["insertTemplate"]>[0];

function fakeDeps(
  existing: string[] = [],
  active: Array<{ tenant: string; audience: "child" | "adult" | null; language: "he" | "en" | null }> = [],
) {
  const rows: Row[] = [];
  const deps: SeedDeps = {
    hasTemplate: (id) => Promise.resolve(existing.includes(id) || rows.some((r) => r.tenant_id === id)),
    activeVersions: (id) =>
      Promise.resolve([...active.filter((a) => a.tenant === id), ...rows.filter((r) => r.tenant_id === id)].map((r) => ({
        audience: r.audience,
        language: r.language,
      }))),
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

Deno.test("a new dance studio gets both health declarations, by audience, in both languages", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), 4);
  assertEquals(rows.map((r) => [r.name, r.audience, r.language]), [
    ["Health declaration (under 18)", "child", "en"],
    ["Health declaration (adults)", "adult", "en"],
    ["הצהרת בריאות (מתחת לגיל 18)", "child", "he"],
    ["הצהרת בריאות (מבוגרים)", "adult", "he"],
  ]);
  for (const row of rows) {
    checkFilled(row);
    assertEquals(row.version_hash, await sha256Hex(row.content));
  }
});

Deno.test("a new photographer gets one agreement with the photography add-on, merge fields kept", async () => {
  const { deps, rows } = fakeDeps();
  assertEquals(await seedSignedTemplate(deps, studio("photographer")), 2);
  assertEquals(rows.map((r) => [r.name, r.language]), [
    ["Photography services agreement", "en"],
    ["הסכם שירותי צילום", "he"],
  ]);
  assertEquals(rows[0].audience, null);
  assertStringIncludes(rows[0].content, "{{client_name}}");
  checkFilled(rows[0]);
});

Deno.test("a beautician gets the agreement with its add-on; a general studio the base agreement", async () => {
  const beauty = fakeDeps();
  assertEquals(await seedSignedTemplate(beauty.deps, studio("beautician")), 2);
  assertEquals(beauty.rows[0].name, "Treatment services agreement");
  checkFilled(beauty.rows[0]);

  const generic = fakeDeps();
  assertEquals(await seedSignedTemplate(generic.deps, studio("generic")), 2);
  assertEquals(generic.rows[0].name, "Service agreement");
  checkFilled(generic.rows[0]);
  assert(beauty.rows[0].content.length > generic.rows[0].content.length, "the add-on is appended");
});

Deno.test("the studio's own language comes first; both languages are filled", async () => {
  const { deps, rows } = fakeDeps();
  await seedSignedTemplate(deps, studio("dance-studio", "he"));
  assertEquals(rows.map((r) => r.language), ["he", "he", "en", "en"]);
  for (const row of rows) checkFilled(row);
});

Deno.test("an existing form is never replaced", async () => {
  const { deps, rows } = fakeDeps(["t-dance-studio", "t-generic"]);
  assertEquals(await seedSignedTemplate(deps, studio("generic")), 0);
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio")), 0);
  assertEquals(rows.length, 0);
});

Deno.test("fillMissing: an existing studio gets only the versions it lacks; its forms are left alone", async () => {
  // Created on the old release: one Hebrew health declaration for everyone.
  const { deps, rows } = fakeDeps(["t-dance-studio"], [{ tenant: "t-dance-studio", audience: null, language: null }]);
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio", "he"), { fillMissing: true }), 4);
  assertEquals(rows.map((r) => [r.audience, r.language]), [["child", "he"], ["adult", "he"], ["child", "en"], ["adult", "en"]]);
  // Run again: nothing more.
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio", "he"), { fillMissing: true }), 0);
});

Deno.test("fillMissing: a studio with the Hebrew forms gets only the English ones", async () => {
  const { deps, rows } = fakeDeps(["t-dance-studio"], [
    { tenant: "t-dance-studio", audience: "child", language: "he" },
    { tenant: "t-dance-studio", audience: "adult", language: null },
  ]);
  assertEquals(await seedSignedTemplate(deps, studio("dance-studio", "he"), { fillMissing: true }), 2);
  assertEquals(rows.map((r) => [r.audience, r.language]), [["child", "en"], ["adult", "en"]]);
});

Deno.test("Clients sign a health declaration: the studio's setting decides, else its field", async () => {
  // A dance studio that turned it off: no health forms (and no agreement: it has enrolment terms).
  let fake = fakeDeps();
  assertEquals(await seedSignedTemplate(fake.deps, { ...studio("dance-studio"), health_declaration: false }), 0);
  // A general studio that turned it on: both health declarations and the agreement.
  fake = fakeDeps();
  await seedSignedTemplate(fake.deps, { ...studio("generic"), health_declaration: true });
  assertEquals(fake.rows.filter((r) => r.language === "en").map((r) => r.audience), ["child", "adult", null]);
  // A swim-coach skin row that says so, with no studio setting yet.
  fake = fakeDeps();
  await seedSignedTemplate(fake.deps, {
    ...studio("swim-coach"),
    skin_row: { name_en: "Swim coach", default_switches: { health_declaration: true }, legal_addon: null },
  });
  assertEquals(fake.rows.filter((r) => r.language === "en").map((r) => r.audience), ["child", "adult", null]);
  fake.rows.forEach(checkFilled);
});

Deno.test("tutors, coaches and therapists: the agreement carries the coaching add-on", async () => {
  const { deps, rows } = fakeDeps();
  await seedSignedTemplate(deps, { ...studio("private-tutor"), skin_row: { name_en: "Private tutor", legal_addon: "coaching" } });
  const en = rows.find((r) => r.language === "en")!;
  assertEquals(en.name, "Sessions agreement");
  assertStringIncludes(en.content, "Coaching and tutoring sessions");
  assertStringIncludes(en.content, "A session lasts 60 minutes, in person or online by video.");
  assertStringIncludes(en.content, "expire or may be extended once by 3 months on request");
  rows.forEach(checkFilled);
  const he = rows.find((r) => r.language === "he")!;
  assertStringIncludes(he.content, "פגישה נמשכת 60 דקות, פנים אל פנים או מקוון בווידאו.");
  assertStringIncludes(he.content, "פוקעות או שניתן להאריך פעם אחת ב-3 חודשים לפי בקשה");
});
