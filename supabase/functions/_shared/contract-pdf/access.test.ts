/** Who may mint a download link for a signed shoot contract. */
import { assertEquals } from "jsr:@std/assert@^1";
import { decideContractPdfAccess, decideContractPdfGenerateAccess } from "./access.ts";

const TENANT = "t1";
const job = { tenantId: TENANT, personId: "p-client", accountId: "acct-client" };
const stored = { path: `contracts/${TENANT}/e1/ev1.pdf` };

function decide(overrides: Partial<Parameters<typeof decideContractPdfAccess>[0]>) {
  return decideContractPdfAccess({
    callerTenantId: TENANT,
    callerRoles: [],
    callerPersonId: null,
    callerAccountIds: [],
    job,
    signed: true,
    pdf: stored,
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

Deno.test("unknown job → 404; unsigned → 409; signed but no PDF yet (failed at signing, not regenerated) → 409", () => {
  assertEquals(decide({ callerRoles: ["tenant_admin"], job: null }).ok, false);
  assertEquals(decide({ callerRoles: ["tenant_admin"], signed: false, pdf: null }), { ok: false, status: 409, error: "Contract not signed yet" });
  const pending = decide({ callerRoles: ["tenant_admin"], pdf: null });
  assertEquals(pending.ok, false);
  assertEquals((pending as { status: number }).status, 409);
});

Deno.test("Generate PDF: tenant admins of the job's tenant only", () => {
  assertEquals(decideContractPdfGenerateAccess({ callerTenantId: TENANT, callerRoles: ["tenant_admin"], job: { tenantId: TENANT } }), { ok: true });
  assertEquals(decideContractPdfGenerateAccess({ callerTenantId: TENANT, callerRoles: [], job: { tenantId: TENANT } }).ok, false);
  assertEquals((decideContractPdfGenerateAccess({ callerTenantId: TENANT, callerRoles: [], job: { tenantId: TENANT } }) as { status: number }).status, 403);
  assertEquals((decideContractPdfGenerateAccess({ callerTenantId: "t2", callerRoles: ["tenant_admin"], job: { tenantId: TENANT } }) as { status: number }).status, 404);
  assertEquals((decideContractPdfGenerateAccess({ callerTenantId: TENANT, callerRoles: ["tenant_admin"], job: null }) as { status: number }).status, 404);
});
