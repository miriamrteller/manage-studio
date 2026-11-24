import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { rememberClientLanguage, resolveEmailLanguage } from "./resolve-email-language.ts";
import { isolate, isolateLtr } from "./bidi.ts";

type Row = Record<string, unknown>;

/** A tiny stand-in for the service client: filters rows by .eq(); records updates. */
function fakeService(tables: Record<string, Row[]>) {
  const updates: Array<{ table: string; values: Row; filters: Row }> = [];
  const client = {
    from(table: string) {
      const filters: Row = {};
      let values: Row | null = null;
      const rows = () =>
        (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const q = {
        select: () => q,
        update: (v: Row) => {
          values = v;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        not: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: () => Promise.resolve({ data: rows().find((r) => r.language !== null || table !== "leads") ?? null }),
        then: (resolve: (v: { error: null }) => unknown) => {
          if (values) updates.push({ table, values, filters: { ...filters } });
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { service: client as unknown as SupabaseClient, updates };
}

const T = "tenant-1";

Deno.test("a client's emails use the language they booked in", async () => {
  const { service } = fakeService({
    people: [{ id: "p1", tenant_id: T, language: "en", user_profile_id: null, email: "a@x.test" }],
  });
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, personId: "p1", tenantDefault: "he" }), "en");
});

Deno.test("a signed-in client's own language choice comes first", async () => {
  const { service } = fakeService({
    people: [{ id: "p1", tenant_id: T, language: "en", user_profile_id: "u1", email: "a@x.test" }],
    user_profiles: [{ id: "u1", language: "he" }],
  });
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, personId: "p1", tenantDefault: "en" }), "he");
});

Deno.test("found by email when only the address is known", async () => {
  const { service } = fakeService({
    people: [{ id: "p1", tenant_id: T, language: "en", user_profile_id: null, email: "a@x.test" }],
  });
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, email: " A@x.test ", tenantDefault: "he" }), "en");
});

Deno.test("a lead gets the language they sent the form in", async () => {
  const { service } = fakeService({
    leads: [{ tenant_id: T, email: "lead@x.test", language: "en" }],
  });
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, email: "lead@x.test", tenantDefault: "he" }), "en");
});

Deno.test("nothing saved: the studio's language", async () => {
  const { service } = fakeService({
    people: [{ id: "p1", tenant_id: T, language: null, user_profile_id: null, email: null }],
    tenants: [{ id: T, language_default: "en" }],
  });
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, personId: "p1" }), "en");
  assertEquals(await resolveEmailLanguage(service, { tenantId: T, personId: "p1", tenantDefault: "he" }), "he");
});

Deno.test("rememberClientLanguage saves only he/en, on the studio's own client", async () => {
  const { service, updates } = fakeService({});
  await rememberClientLanguage(service, { tenantId: T, personId: "p1", language: "en" });
  await rememberClientLanguage(service, { tenantId: T, email: "B@x.test", language: "he" });
  await rememberClientLanguage(service, { tenantId: T, personId: "p1", language: "fr" });
  await rememberClientLanguage(service, { tenantId: T, language: "en" });
  assertEquals(updates, [
    { table: "people", values: { language: "en" }, filters: { tenant_id: T, id: "p1" } },
    { table: "people", values: { language: "he" }, filters: { tenant_id: T, email: "b@x.test" } },
  ]);
});

Deno.test("bidi isolates keep mixed-script text in order", () => {
  assertEquals(isolate("Reuve and Miri"), "⁨Reuve and Miri⁩");
  assertEquals(isolateLtr("09:00–10:00"), "⁦09:00–10:00⁩");
  assertEquals(isolate(""), "");
});
