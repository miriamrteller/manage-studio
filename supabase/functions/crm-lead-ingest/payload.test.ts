/**
 * crm-lead-ingest payloads: inbound email (channel email) and the
 * opalswift.com contact form (channel website, filed in the hq studio).
 * Run: cd supabase/functions && deno test crm-lead-ingest/payload.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { leadFromPayload, payloadSchema } from "./payload.ts";

const NOW = "2026-11-03T08:00:00.000Z";
const ID = "3b2f1c6e-8a54-4e0e-9a3f-2d1c0b9e7a61";

Deno.test("a contact-form enquiry becomes a website lead, deduped per submission", () => {
  const payload = payloadSchema.parse({
    tenantSubdomain: "hq",
    contact: { submissionId: ID, name: " Dana Cohen ", email: "Dana@Example.com", message: " Invoices take me hours. " },
  });
  assertEquals(leadFromPayload(payload, NOW), {
    fields: {
      name: "Dana Cohen",
      email: "dana@example.com",
      phone: null,
      interest: null,
      lastCommunicationNote: "Invoices take me hours.",
    },
    opts: { channel: "website", sourceRef: `contact:${ID}`, receivedAt: NOW },
  });
});

Deno.test("an inbound email still becomes an email lead", () => {
  const payload = payloadSchema.parse({
    tenantSubdomain: "creativeballet",
    message: {
      messageId: "<m1@example.com>",
      fromName: "Noa",
      fromEmail: "noa@example.com",
      subject: "Ballet for my daughter",
      text: "Hi, do you have places?",
      receivedAt: "2026-11-02T10:00:00Z",
    },
  });
  const { fields, opts } = leadFromPayload(payload, NOW);
  assertEquals(opts, { channel: "email", sourceRef: "<m1@example.com>", receivedAt: "2026-11-02T10:00:00Z" });
  assertEquals(fields.email, "noa@example.com");
});

Deno.test("a contact enquiry needs a real email, a name and a submission id", () => {
  const base = { submissionId: ID, name: "Dana", email: "dana@example.com", message: "Hi" };
  for (const contact of [
    { ...base, email: "not-an-email" },
    { ...base, name: "  " },
    { ...base, submissionId: "1" },
    { ...base, message: "x".repeat(5001) },
  ]) {
    assertEquals(payloadSchema.safeParse({ tenantSubdomain: "hq", contact }).success, false);
  }
});
