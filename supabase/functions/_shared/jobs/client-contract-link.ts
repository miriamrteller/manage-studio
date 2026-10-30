/**
 * Client "Sign now" from the photographer client portal: who may get a fresh
 * contract-signing link for a job, and for which email.
 *
 * Only the client themselves — the person on the job, or a login that is a
 * member of the job's client account — never another client of the tenant.
 * The link is a WaiverToken for the job's own client email, which is already
 * an allowed recipient in get-waiver-engagement (token-recipient.ts), so no
 * audit-log recipient grant is needed.
 */

export type ClientContractLinkDecision =
  | { ok: true; email: string }
  | { ok: false; status: 403 | 404 | 409; error: string };

export function decideClientContractLink(input: {
  /** user_profiles.tenant_id of the caller. */
  callerTenantId: string | null;
  /** people.id linked to the caller's login (people.user_profile_id), if any. */
  callerPersonId: string | null;
  /** account_members.account_id rows for the caller's login. */
  callerAccountIds: string[];
  job: {
    tenantId: string;
    personId: string;
    accountId: string | null;
    clientEmail: string | null;
    waiverEvidenceId: string | null;
    engagementStatus: string;
    jobStatus: string;
  } | null;
  hasActiveTemplate: boolean;
}): ClientContractLinkDecision {
  const { job } = input;
  if (!job || input.callerTenantId !== job.tenantId) {
    return { ok: false, status: 404, error: "Shoot not found" };
  }
  const isOwnJob =
    (input.callerPersonId !== null && input.callerPersonId === job.personId) ||
    (job.accountId !== null && input.callerAccountIds.includes(job.accountId));
  if (!isOwnJob) return { ok: false, status: 404, error: "Shoot not found" };
  if (job.waiverEvidenceId) return { ok: false, status: 409, error: "Contract already signed" };
  if (job.engagementStatus === "cancelled" || job.jobStatus === "cancelled") {
    return { ok: false, status: 409, error: "Shoot is cancelled" };
  }
  if (!input.hasActiveTemplate) return { ok: false, status: 409, error: "No active contract template" };
  const email = job.clientEmail?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) return { ok: false, status: 409, error: "No client email on this shoot" };
  return { ok: true, email };
}

/** App-relative signing URL (the client is already on the tenant's origin). */
export function clientContractSignPath(engagementId: string, token: string): string {
  return `/enrol/complete?engagementId=${encodeURIComponent(engagementId)}&wt=${encodeURIComponent(token)}`;
}
