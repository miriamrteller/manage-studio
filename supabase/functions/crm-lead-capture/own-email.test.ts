/**
 * The studio's-own-email check shared by crm-lead-capture and crm-lead-ingest.
 * Run: cd supabase/functions && deno test crm-lead-capture/own-email.test.ts
 * All addresses are made up.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enquiryUsesStudioEmail,
  isStudioOwnEmail,
  normaliseEmailForMatch,
  tenantOwnEmails,
} from "../_shared/crm-contract/studio-own-email.ts";

Deno.test("matches ignoring case, spaces and a +tag", () => {
  assertEquals(normaliseEmailForMatch("  Studio+Test@Example.COM "), "studio@example.com");
  assert(isStudioOwnEmail("STUDIO+form@example.com", ["studio@example.com"]));
  assert(!isStudioOwnEmail("parent@example.com", ["studio@example.com"]));
  assert(!isStudioOwnEmail(null, ["studio@example.com"]));
  assert(!isStudioOwnEmail("not-an-email", ["not-an-email"]));
});

Deno.test("tenant emails: business, sending and legal-page addresses", () => {
  assertEquals(
    tenantOwnEmails({
      contact_email: "hello@studio.test",
      from_email: "news@studio.test",
      legal_profile: { email: "legal@studio.test", privacy_contact_email: "", other: "x@y.test" },
    }),
    ["hello@studio.test", "news@studio.test", "legal@studio.test"],
  );
});

/** A fake service client that answers each table with fixed rows. */
function fakeService(rows: Record<string, unknown>, failing: string[] = []) {
  return {
    from(table: string) {
      const result = failing.includes(table)
        ? { data: null, error: { message: "boom" } }
        : { data: rows[table] ?? null, error: null };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "overlaps", "not"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve(result);
      q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result).then(ok, bad);
      return q;
    },
  };
}

const rows = {
  tenants: { contact_email: "hello@studio.test", from_email: null, legal_profile: {} },
  user_profiles: [{ email: "owner@login.test" }],
  staff: [{ email: "teacher@staff.test" }],
};

Deno.test("refuses the business email, a staff login and a staff record's email", async () => {
  const service = fakeService(rows);
  assert(await enquiryUsesStudioEmail(service, "t1", "Hello@studio.test"));
  assert(await enquiryUsesStudioEmail(service, "t1", "owner@login.test"));
  assert(await enquiryUsesStudioEmail(service, "t1", "teacher@staff.test"));
  assert(!(await enquiryUsesStudioEmail(service, "t1", "parent@family.test")));
  assert(!(await enquiryUsesStudioEmail(service, "t1", null)));
});

Deno.test("a failed read never blocks a real enquiry", async () => {
  const service = fakeService(rows, ["tenants", "user_profiles", "staff"]);
  assert(!(await enquiryUsesStudioEmail(service, "t1", "hello@studio.test")));
  // One table failing still checks the others.
  assert(await enquiryUsesStudioEmail(fakeService(rows, ["tenants"]), "t1", "owner@login.test"));
});
