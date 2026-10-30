/**
 * Who may download a signed shoot contract. The PDF lives in the private
 * legal-documents bucket; the only way to it is a short-lived signed URL from
 * job-contract-pdf-link, which runs this check first.
 *
 * - A tenant admin (or super admin) of the job's tenant: yes.
 * - The client: the person on the job, or a login that is a member of the
 *   job's client account — never another client of the same tenant.
 * - Anyone else sees "not found", the same as a job that does not exist, so
 *   the endpoint cannot be used to probe engagement ids.
 */

export type ContractPdfAccess =
  | { ok: true; role: "admin" | "client" }
  | { ok: false; status: 404 | 409; error: string };

export function decideContractPdfAccess(input: {
  callerTenantId: string | null;
  callerRoles: string[];
  /** people.id linked to the caller's login, if any. */
  callerPersonId: string | null;
  /** account_members.account_id rows for the caller's login. */
  callerAccountIds: string[];
  job: { tenantId: string; personId: string; accountId: string | null } | null;
  /** True when the job's contract has a waiver_evidence row. */
  signed: boolean;
  /** Where the PDF is (contractPdfLocation), or null when none exists yet. */
  pdf: { path: string } | null;
}): ContractPdfAccess {
  const { job } = input;
  if (!job || !input.callerTenantId || input.callerTenantId !== job.tenantId) {
    return { ok: false, status: 404, error: "Shoot not found" };
  }
  const isAdmin = input.callerRoles.includes("tenant_admin") || input.callerRoles.includes("super_admin");
  const isOwnJob =
    (input.callerPersonId !== null && input.callerPersonId === job.personId) ||
    (job.accountId !== null && input.callerAccountIds.includes(job.accountId));
  if (!isAdmin && !isOwnJob) return { ok: false, status: 404, error: "Shoot not found" };
  if (!input.signed) return { ok: false, status: 409, error: "Contract not signed yet" };
  if (!input.pdf) {
    return { ok: false, status: 409, error: "The signed contract has no PDF yet — the studio can generate one from the shoot page" };
  }
  return { ok: true, role: isAdmin ? "admin" : "client" };
}

/** Only a tenant admin of the job's tenant may generate a PDF after signing. */
export function decideContractPdfGenerateAccess(input: {
  callerTenantId: string | null;
  callerRoles: string[];
  job: { tenantId: string } | null;
}): { ok: true } | { ok: false; status: 403 | 404; error: string } {
  if (!input.job || !input.callerTenantId || input.callerTenantId !== input.job.tenantId) {
    return { ok: false, status: 404, error: "Shoot not found" };
  }
  if (!input.callerRoles.includes("tenant_admin") && !input.callerRoles.includes("super_admin")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true };
}
