/**
 * The PDF half of the evidence record:
 * - dance waivers keep the V1 sentinel pair and never touch the renderer or storage;
 * - job contracts get a real path + SHA-256, computed before the insert;
 * - record_hmac built by the signer helper verifies with the UNCHANGED
 *   verify-waiver-evidence.ts, and a changed pdf_sha256 breaks it.
 */
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@^1";
import { sha256Hex } from "../edge-runtime/hmac.ts";
import { CANONICAL_FIELDS, verifyWaiverEvidence } from "../verify-waiver-evidence.ts";
import type { JobContractContext } from "../job-contract.ts";
import {
  buildJobContractPdf,
  CONTRACT_PDF_BUCKET,
  type ContractPdfStorage,
  contractPdfLocation,
  contractPdfStoragePath,
  hasStoredPdf,
  regeneratedContractPdfStoragePath,
  NO_PDF,
  PDF_DEFERRED_SENTINEL,
  PDF_SHA256_NONE,
  prepareWaiverPdf,
  waiverRecordCanonical,
  type WaiverRecordFields,
  waiverRecordHmac,
} from "./evidence.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const ENGAGEMENT = "22222222-2222-4222-8222-222222222222";
const EVIDENCE = "33333333-3333-4333-8333-333333333333";

const job: JobContractContext = {
  engagementId: ENGAGEMENT,
  personId: "44444444-4444-4444-8444-444444444444",
  accountId: null,
  offeringId: "55555555-5555-4555-8555-555555555555",
  engagementStatus: "active",
  waiverEvidenceId: null,
  jobStatus: "booked",
  clientEmail: "dana@example.com",
  fields: { client_name: "Dana Cohen", shoot_date: "24 November 2026", location: "Tel Aviv", package: "Family", price: "₪1,250.00" },
};

const baseParams = {
  tenantId: TENANT,
  tenant: { name: "Lumen & Light", logo_url: null },
  language: "en" as const,
  template: { name: "Photography agreement", version: 3 },
  wordingSnapshot: "Signed wording",
  evidenceId: EVIDENCE,
  typedName: "Dana Cohen",
  signedAt: "2026-10-30T10:15:42.000Z",
  signerEmail: "dana@example.com",
  consentVersionHash: "a".repeat(64),
};

function fakeStorage() {
  const uploads: Array<{ bucket: string; path: string; bytes: Uint8Array; options: unknown }> = [];
  const storage: ContractPdfStorage = {
    from(bucket) {
      return {
        upload(path, bytes, options) {
          uploads.push({ bucket, path, bytes, options });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { storage, uploads };
}

const explodingDeps = {
  render: () => Promise.reject(new Error("render must not run for a dance waiver")),
  fetchLogo: () => Promise.reject(new Error("logo fetch must not run for a dance waiver")),
};

Deno.test("dance waiver (no job): the V1 sentinel pair, nothing rendered or uploaded", async () => {
  const { storage, uploads } = fakeStorage();
  const artifact = await prepareWaiverPdf(storage, { ...baseParams, job: null }, explodingDeps);
  assertEquals(artifact, NO_PDF);
  assertEquals(artifact.storagePath, "v1-deferred");
  assertEquals(artifact.pdfSha256, "0".repeat(64));
  assertEquals(uploads.length, 0);
  // The constants accept-waiver stored before Thread G, byte for byte.
  assertEquals(PDF_DEFERRED_SENTINEL, "v1-deferred");
  assertEquals(PDF_SHA256_NONE, "0000000000000000000000000000000000000000000000000000000000000000");
  assertEquals(hasStoredPdf({ pdf_storage_path: artifact.storagePath, pdf_sha256: artifact.pdfSha256 }), false);
});

Deno.test("job contract: rendered, hashed and uploaded to a tenant-scoped key before the insert", async () => {
  const { storage, uploads } = fakeStorage();
  const fakePdf = new TextEncoder().encode("%PDF-fake");
  const artifact = await prepareWaiverPdf(storage, { ...baseParams, job }, {
    render: () => Promise.resolve(fakePdf),
    fetchLogo: () => Promise.resolve(null),
  });
  assertEquals(artifact.storagePath, `contracts/${TENANT}/${ENGAGEMENT}/${EVIDENCE}.pdf`);
  assertEquals(artifact.storagePath, contractPdfStoragePath(TENANT, ENGAGEMENT, EVIDENCE));
  assertEquals(artifact.pdfSha256, await sha256Hex(fakePdf));
  assertEquals(artifact.bytes, fakePdf);
  assertEquals(uploads.length, 1);
  assertEquals(uploads[0].bucket, CONTRACT_PDF_BUCKET);
  assertEquals(uploads[0].options, { contentType: "application/pdf", upsert: false });
  assert(hasStoredPdf({ pdf_storage_path: artifact.storagePath, pdf_sha256: artifact.pdfSha256 }));
});

Deno.test("job contract: the PDF carries the job fields, signer and evidence id", async () => {
  let seen: unknown = null;
  await buildJobContractPdf({ ...baseParams, job }, {
    render: (input) => {
      seen = input;
      return Promise.resolve(new Uint8Array([1]));
    },
    fetchLogo: () => Promise.resolve(null),
  });
  const input = seen as { details: Record<string, string>; signature: Record<string, string>; wording: string; title: string };
  assertEquals(input.title, "Photography agreement");
  assertEquals(input.wording, "Signed wording");
  assertEquals(input.details, { clientName: "Dana Cohen", shootDate: "24 November 2026", packageName: "Family", location: "Tel Aviv", price: "₪1,250.00" });
  assertEquals(input.signature.evidenceId, EVIDENCE);
  assertEquals(input.signature.consentVersionHash, "a".repeat(64));
});

Deno.test("job contract: a storage failure never blocks signing — sentinel pair + failure reason, no throw", async () => {
  const storage: ContractPdfStorage = {
    from: () => ({ upload: () => Promise.resolve({ error: { message: "bucket offline" } }) }),
  };
  const artifact = await prepareWaiverPdf(storage, { ...baseParams, job }, {
    render: () => Promise.resolve(new Uint8Array([1])),
    fetchLogo: () => Promise.resolve(null),
  });
  assertEquals(artifact.storagePath, PDF_DEFERRED_SENTINEL);
  assertEquals(artifact.pdfSha256, PDF_SHA256_NONE);
  assertEquals(artifact.bytes, null);
  assertMatch(artifact.failure ?? "", /bucket offline/);
});

Deno.test("job contract: a render failure degrades the same way, and nothing is uploaded", async () => {
  const { storage, uploads } = fakeStorage();
  const artifact = await prepareWaiverPdf(storage, { ...baseParams, job }, {
    render: () => Promise.reject(new Error("font table corrupt")),
    fetchLogo: () => Promise.resolve(null),
  });
  assertEquals([artifact.storagePath, artifact.pdfSha256], [PDF_DEFERRED_SENTINEL, PDF_SHA256_NONE]);
  assertMatch(artifact.failure ?? "", /font table corrupt/);
  assertEquals(uploads.length, 0);
});

Deno.test("contractPdfLocation: sealed PDF first, else the one generated after signing, else none", () => {
  const sealed = { pdf_storage_path: "contracts/t/e/ev.pdf", pdf_sha256: "b".repeat(64) };
  const sentinel = { pdf_storage_path: PDF_DEFERRED_SENTINEL, pdf_sha256: PDF_SHA256_NONE };
  const after = { pdf_storage_path: "contracts/t/e/ev-after-signing-x.pdf", pdf_sha256: "c".repeat(64), generated_at: "2026-11-01T00:00:00.000Z" };
  assertEquals(contractPdfLocation(sealed, after), { path: sealed.pdf_storage_path, sha256: sealed.pdf_sha256, source: "sealed" });
  assertEquals(contractPdfLocation(sentinel, after), { path: after.pdf_storage_path, sha256: after.pdf_sha256, source: "after_signing" });
  assertEquals(contractPdfLocation(sentinel, null), null);
  assertEquals(contractPdfLocation(null, after), null);
  const key = regeneratedContractPdfStoragePath(TENANT, ENGAGEMENT, EVIDENCE, new Date("2026-11-01T10:20:30.000Z"));
  assertEquals(key, `contracts/${TENANT}/${ENGAGEMENT}/${EVIDENCE}-after-signing-20261101T102030.pdf`);
  assert(key !== contractPdfStoragePath(TENANT, ENGAGEMENT, EVIDENCE));
});

// --- record_hmac: the signer helper and the existing verifier agree ---

const fields: WaiverRecordFields = {
  accept_language: "he-IL,he;q=0.9",
  consent_template_id: "66666666-6666-4666-8666-666666666666",
  consent_version: 3,
  consent_version_hash: "a".repeat(64),
  guardian_confirmed: false,
  idempotency_key: "idem-1",
  ip_address: "203.0.113.7",
  pdf_sha256: "b".repeat(64),
  person_id: job.personId,
  signed_at: "2026-10-30T10:15:42.000Z",
  signed_by_email: "dana@example.com",
  signed_by_name: "Dana Cohen",
  signed_by_role: "self",
  tenant_id: TENANT,
  user_agent: "Mozilla/5.0",
};

Deno.test("canonical JSON has exactly the verifier's 15 fields, alphabetical, no whitespace", () => {
  const canonical = waiverRecordCanonical(fields);
  assertEquals(Object.keys(JSON.parse(canonical)), [...CANONICAL_FIELDS]);
  assert(!/\s/.test(canonical.replace(/"[^"]*"/g, "")));
});

Deno.test("a record sealed with the real pdf_sha256 verifies with the unchanged verifier; a changed hash does not", async () => {
  Deno.env.set("WAIVER_HMAC_KEY_V1", "test-key-v1");
  const record_hmac = await waiverRecordHmac("test-key-v1", fields);
  const row = { id: EVIDENCE, record_hmac, hmac_key_version: 1, ...fields };

  const ok = await verifyWaiverEvidence(row);
  assertEquals(ok.ok, true);

  const tampered = await verifyWaiverEvidence({ ...row, pdf_sha256: "c".repeat(64) });
  assertEquals(tampered.ok, false);
  const sentinelSwap = await verifyWaiverEvidence({ ...row, pdf_sha256: PDF_SHA256_NONE });
  assertEquals(sentinelSwap.ok, false);
});
