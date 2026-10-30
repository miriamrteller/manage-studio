/** Who may mint a download link for a signed shoot contract. */
import { assertEquals } from "jsr:@std/assert@^1";
import { decideContractPdfAccess } from "./access.ts";
import { hasStoredPdf, PDF_DEFERRED_SENTINEL, PDF_SHA256_NONE } from "./evidence.ts";

const TENANT = "t1";
const job = { tenantId: TENANT, personId: "p-client", accountId: "acct-client" };
const stored = { pdf_storage_path: `contracts/${TENANT}/e1/ev1.pdf`, pdf_sha256: "b".repeat(64) };

function decide(overrides: Partial<Parameters<typeof decideContractPdfAccess>[0]>) {
  return decideContractPdfAccess({
    callerTenantId: TENANT,
    callerRoles: [],
    callerPersonId: null,
    callerAccountIds: [],
    job,
    evidence: stored,
    hasStoredPdf,
    ...overrides,
  });
}

Deno.test("the client on the job may download", () => {
  assertEquals(decide({ callerPersonId: "p-client" }), { ok: true, role: "client" });
});

Deno.test("a member of the job's client account may download", () => {
  assertEquals(decide({ callerPersonId: "p-spouse", callerAccountIds: ["acct-client"] }), { ok: true, role: "client" });
});

Deno.test("a tenant admin of the same tenant may download", () => {
  assertEquals(decide({ callerRoles: ["tenant_admin"] }), { ok: true, role: "admin" });
});

Deno.test("another client of the same tenant cannot, and learns nothing (404)", () => {
  assertEquals(decide({ callerPersonId: "p-other", callerAccountIds: ["acct-other"] }), { ok: false, status: 404, error: "Shoot not found" });
});

Deno.test("an admin of another tenant cannot (404)", () => {
  assertEquals(decide({ callerTenantId: "t2", callerRoles: ["tenant_admin"] }), { ok: false, status: 404, error: "Shoot not found" });
});

Deno.test("unknown job → 404; unsigned → 409; signed before PDFs existed → 409", () => {
  assertEquals(decide({ callerRoles: ["tenant_admin"], job: null }).ok, false);
  assertEquals(decide({ callerRoles: ["tenant_admin"], evidence: null }), { ok: false, status: 409, error: "Contract not signed yet" });
  const legacy = decide({ callerRoles: ["tenant_admin"], evidence: { pdf_storage_path: PDF_DEFERRED_SENTINEL, pdf_sha256: PDF_SHA256_NONE } });
  assertEquals(legacy.ok, false);
  assertEquals((legacy as { status: number }).status, 409);
});
