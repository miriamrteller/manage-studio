/**
 * Admin "Generate PDF" after a failure at signing: renders from the sealed
 * wording, stores the PDF under its own key in waiver_evidence_pdfs, clears
 * the shoot flag, audit-logs — and never writes to waiver_evidence.
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@^1";
import type { JobContractContext } from "../job-contract.ts";
import { sha256Hex } from "../edge-runtime/hmac.ts";
import { PDF_DEFERRED_SENTINEL, PDF_SHA256_NONE } from "./evidence.ts";
import { type RegenerateClient, regenerateContractPdf, type SealedEvidenceRow } from "./regenerate.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ENGAGEMENT = "22222222-2222-4222-8222-222222222222";
const EVIDENCE = "33333333-3333-4333-8333-333333333333";

const job: JobContractContext = {
  engagementId: ENGAGEMENT,
  personId: "p1",
  accountId: null,
  offeringId: "o1",
  engagementStatus: "active",
  waiverEvidenceId: EVIDENCE,
  jobStatus: "booked",
  clientEmail: "dana@example.com",
  fields: { client_name: "Dana Cohen", shoot_date: "24 November 2026", location: "Tel Aviv", package: "Family", price: "₪1,250" },
};

const sealedRow: SealedEvidenceRow = {
  id: EVIDENCE,
  pdf_storage_path: PDF_DEFERRED_SENTINEL,
  pdf_sha256: PDF_SHA256_NONE,
  wording_snapshot: "The exact wording that was signed",
  consent_template_id: "tpl1",
  consent_version: 3,
  consent_version_hash: "a".repeat(64),
  signed_at: "2026-10-30 10:15:42+00",
  signed_by_name: "Dana Cohen",
  signed_by_email: "dana@example.com",
};

function fakeClient(opts: { evidence?: SealedEvidenceRow | null; existing?: Record<string, unknown> | null } = {}) {
  const writes: Array<{ table: string; op: string; row: Record<string, unknown> }> = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  const tables: Record<string, unknown> = {
    waiver_evidence: opts.evidence === undefined ? sealedRow : opts.evidence,
    waiver_evidence_pdfs: opts.existing ?? null,
    consent_templates: { name: "Photography agreement" },
  };
  const query = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: () => Promise.resolve({ data: tables[table] ?? null, error: null }),
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, op: "insert", row });
        return Promise.resolve({ error: null });
      },
      update: (row: Record<string, unknown>) => {
        writes.push({ table, op: "update", row });
        return q;
      },
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return q;
  };
  const client: RegenerateClient = {
    from: query,
    storage: {
      from: () => ({
        upload: (path: string, bytes: Uint8Array) => {
          uploads.push({ path, bytes });
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
  return { client, writes, uploads };
}

const pdfBytes = new TextEncoder().encode("%PDF-after");
const deps = {
  render: (input: { wording: string; signature: { generatedAfterSigningAt?: string | null } }) => {
    assertEquals(input.wording, "The exact wording that was signed");
    assert(input.signature.generatedAfterSigningAt, "the PDF must say it was generated after signing");
    return Promise.resolve(pdfBytes);
  },
  fetchLogo: () => Promise.resolve(null),
};

Deno.test("renders from the sealed wording, stores under a separate key, records in waiver_evidence_pdfs, clears the flag", async () => {
  const { client, writes, uploads } = fakeClient();
  const now = new Date("2026-11-01T10:20:30.000Z");
  const result = await regenerateContractPdf(client, {
    tenantId: TENANT, tenant: { name: "Lumen", logo_url: null }, language: "en", job, actorId: "admin-1", now,
  }, deps);
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.created, true);
  assertEquals(result.pdf.pdf_storage_path, `contracts/${TENANT}/${ENGAGEMENT}/${EVIDENCE}-after-signing-20261101T102030.pdf`);
  assertEquals(result.pdf.pdf_sha256, await sha256Hex(pdfBytes));
  assertEquals(uploads.map((u) => u.path), [result.pdf.pdf_storage_path]);

  // Never the immutable evidence row.
  assertEquals(writes.filter((w) => w.table === "waiver_evidence"), []);
  const recorded = writes.find((w) => w.table === "waiver_evidence_pdfs");
  assertEquals(recorded?.op, "insert");
  assertEquals(recorded?.row.waiver_evidence_id, EVIDENCE);
  assertEquals(recorded?.row.reason, "generated_after_signing");
  assertEquals(recorded?.row.generated_by, "admin-1");
  const flag = writes.find((w) => w.table === "job_details");
  assertEquals(flag?.row.contract_pdf_pending, false);
  const audit = writes.find((w) => w.table === "audit_log");
  assertEquals(audit?.row.action, "job_contract_pdf_generated");
});

Deno.test("a second click reuses the generated PDF instead of rendering again", async () => {
  const existing = { pdf_storage_path: "contracts/x/y/z-after-signing-1.pdf", pdf_sha256: "c".repeat(64), generated_at: "2026-11-01T00:00:00.000Z" };
  const { client, writes, uploads } = fakeClient({ existing });
  const result = await regenerateContractPdf(client, {
    tenantId: TENANT, tenant: { name: "Lumen", logo_url: null }, language: "en", job, actorId: "admin-1",
  }, { render: () => Promise.reject(new Error("must not render")), fetchLogo: () => Promise.resolve(null) });
  assertEquals(result, { ok: true, pdf: existing, created: false });
  assertEquals(uploads, []);
  assertEquals(writes, []);
});

Deno.test("refuses when the contract already has its sealed PDF, or is not signed", async () => {
  const sealed = { ...sealedRow, pdf_storage_path: `contracts/${TENANT}/${ENGAGEMENT}/${EVIDENCE}.pdf`, pdf_sha256: "b".repeat(64) };
  const { client } = fakeClient({ evidence: sealed });
  const result = await regenerateContractPdf(client, {
    tenantId: TENANT, tenant: { name: "Lumen", logo_url: null }, language: "en", job, actorId: null,
  }, deps);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.error, /already has its sealed PDF/);

  const unsigned = await regenerateContractPdf(fakeClient().client, {
    tenantId: TENANT, tenant: { name: "Lumen", logo_url: null }, language: "en", job: { ...job, waiverEvidenceId: null }, actorId: null,
  }, deps);
  assertEquals(unsigned, { ok: false, status: 409, error: "Contract not signed yet" });
});
