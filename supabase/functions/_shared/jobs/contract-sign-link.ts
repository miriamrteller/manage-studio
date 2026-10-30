/**
 * Job contract signing links — the one place that mints them.
 *
 * A signing link is a WaiverToken (waiver-token.ts) scoped to the job's
 * engagement + one recipient email, opened on /enrol/complete
 * (get-waiver-engagement renders the contract, accept-waiver stores it).
 * Used by:
 *   - send-job-contract-link (admin emails the link),
 *   - client-job-contract-link (client portal "Sign now"),
 *   - accept-quote (client continues straight from the accepted quote).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { signWaiverToken } from "../waiver-token.ts";

/** Links that go out by email stay valid for two weeks. */
export const JOB_CONTRACT_EMAIL_LINK_TTL_SECONDS = 14 * 24 * 3600;

/** App-relative signing URL; prefix the tenant origin for an email. */
export function jobContractSignPath(engagementId: string, token: string): string {
  return `/enrol/complete?engagementId=${encodeURIComponent(engagementId)}&wt=${encodeURIComponent(token)}`;
}

/** The job facts that decide whether a signing link may be issued. */
export interface ContractLinkJob {
  waiverEvidenceId: string | null;
  engagementStatus: string;
  jobStatus: string;
}

export type ContractLinkBlocker =
  | { code: "not_found"; status: 404; error: string }
  | { code: "cancelled"; status: 409; error: string }
  | { code: "already_signed"; status: 409; error: string }
  | { code: "no_template"; status: 409; error: string };

/** Null when a link may be issued; otherwise why not. */
export function contractLinkBlocker(job: ContractLinkJob | null, hasActiveTemplate: boolean): ContractLinkBlocker | null {
  if (!job) return { code: "not_found", status: 404, error: "Job not found" };
  if (job.engagementStatus === "cancelled" || job.jobStatus === "cancelled") {
    return { code: "cancelled", status: 409, error: "Job is cancelled" };
  }
  if (job.waiverEvidenceId) return { code: "already_signed", status: 409, error: "Contract already signed" };
  if (!hasActiveTemplate) return { code: "no_template", status: 409, error: "No active contract template" };
  return null;
}

/** The active consent template is the tenant's contract. */
export async function hasActiveContractTemplate(service: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await service
    .from("consent_templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();
  return !error && Boolean(data);
}

export interface JobContractSignLink {
  token: string;
  path: string;
  expiresAt: number;
}

/** Mints a WaiverToken for one recipient and returns the app-relative link. */
export async function mintJobContractSignLink(
  service: SupabaseClient,
  input: { tenantId: string; engagementId: string; email: string; ttlSeconds: number; nowSeconds?: number },
): Promise<JobContractSignLink> {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + input.ttlSeconds;
  const token = await signWaiverToken(service, {
    eid: input.engagementId,
    tid: input.tenantId,
    em: input.email.trim().toLowerCase(),
    exp: expiresAt,
  });
  return { token, path: jobContractSignPath(input.engagementId, token), expiresAt };
}
