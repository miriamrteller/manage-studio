/**
 * Client booking flow after a quote is accepted: sign the contract, then pay
 * the deposit, with no waiting for the photographer in between.
 *
 *   accept-quote   → resolveQuoteNextSteps()  → { contractSignPath?, depositPayPath? }
 *   job-next-step  → resolveJobNextStep()     → pay the deposit, or go to the portal
 *
 * Pure decision logic with injected loaders, so the rules (and the token
 * checks) are unit-tested without a database: apps/web/src/__tests__/booking-next-steps.test.ts.
 */
import { contractLinkBlocker, type ContractLinkJob } from "./contract-sign-link.ts";

/** Statuses a client can still pay (mirrors payment-request-state.ts). */
const COLLECTABLE = new Set(["pending", "sent"]);

export const CLIENT_PORTAL_PATH = "/dashboard/portal";

export function depositPayPath(publicToken: string): string {
  return `/pay/${encodeURIComponent(publicToken)}`;
}

/**
 * The deposit request created by accept_quote(): it inserts the deposit first,
 * and only when deposit_minor > 0, so it is payment_request_ids[0] then.
 */
export function depositRequestIdFromAcceptResult(result: {
  deposit_minor?: number | null;
  payment_request_ids?: unknown;
} | null | undefined): string | null {
  if (!result || !(typeof result.deposit_minor === "number" && result.deposit_minor > 0)) return null;
  const ids = Array.isArray(result.payment_request_ids) ? result.payment_request_ids : [];
  return typeof ids[0] === "string" ? ids[0] : null;
}

export interface NextStepRequest {
  id: string;
  engagement_id: string;
  status: string;
  public_token: string;
  amount_minor: number;
  currency: string;
}

/** The deposit, only when it belongs to this job and can still be paid. */
export function collectableDeposit(
  requests: NextStepRequest[],
  depositRequestId: string | null,
  engagementId: string,
): NextStepRequest | null {
  if (!depositRequestId) return null;
  const deposit = requests.find((r) => r.id === depositRequestId);
  if (!deposit || deposit.engagement_id !== engagementId) return null;
  return COLLECTABLE.has(deposit.status) ? deposit : null;
}

// ---------------------------------------------------------------------------
// accept-quote
// ---------------------------------------------------------------------------

export interface QuoteNextStepsDeps {
  loadJob(engagementId: string): Promise<(ContractLinkJob & { clientEmail: string | null }) | null>;
  hasActiveTemplate(): Promise<boolean>;
  loadRequests(engagementId: string): Promise<NextStepRequest[]>;
  /** Mints a signing link for the job's own client email. */
  mintSignPath(engagementId: string, email: string): Promise<string>;
}

export interface QuoteNextSteps {
  contractSignPath?: string;
  depositPayPath?: string;
}

/**
 * Links for the client's next steps. Safe to call on every (replayed) accept:
 * it only reads and mints a fresh, equivalent token — no state changes.
 * The signing link is for the job's own client email, which get-waiver-engagement
 * always accepts as a recipient (token-recipient.ts), so no grant is recorded.
 */
export async function resolveQuoteNextSteps(
  deps: QuoteNextStepsDeps,
  result: { engagement_id?: string | null; deposit_minor?: number | null; payment_request_ids?: unknown },
): Promise<QuoteNextSteps> {
  const engagementId = result.engagement_id;
  if (!engagementId) return {};

  const [job, hasTemplate, requests] = await Promise.all([
    deps.loadJob(engagementId),
    deps.hasActiveTemplate(),
    deps.loadRequests(engagementId),
  ]);

  const steps: QuoteNextSteps = {};
  const email = job?.clientEmail?.trim().toLowerCase() ?? "";
  if (!contractLinkBlocker(job, hasTemplate) && email.includes("@")) {
    steps.contractSignPath = await deps.mintSignPath(engagementId, email);
  }
  const deposit = collectableDeposit(requests, depositRequestIdFromAcceptResult(result), engagementId);
  if (deposit) steps.depositPayPath = depositPayPath(deposit.public_token);
  return steps;
}

// ---------------------------------------------------------------------------
// job-next-step (after signing on /enrol/complete)
// ---------------------------------------------------------------------------

export interface JobNextStepDeps {
  loadJob(engagementId: string): Promise<{ personId: string; waiverEvidenceId: string | null } | null>;
  allowedEmails(engagementId: string, personId: string): Promise<Set<string>>;
  /** accepted_result of the job's accepted quote, if any. */
  loadAcceptedQuoteResult(engagementId: string): Promise<{ deposit_minor?: number | null; payment_request_ids?: unknown } | null>;
  loadRequests(engagementId: string): Promise<NextStepRequest[]>;
}

export type JobNextStep =
  | { ok: true; next: "pay_deposit"; payPath: string; amountMinor: number; currency: string }
  | { ok: true; next: "portal"; portalPath: string; reason: "deposit_paid" | "no_deposit" }
  | { ok: false; status: 403 | 404 | 409; code: "token_mismatch" | "not_job" | "email_mismatch" | "not_signed" };

/**
 * Where the client goes once the contract is signed. Everything comes from
 * the verified WaiverToken: the requested engagement must be the token's own
 * (a token for another job is refused), and the pay link is looked up here,
 * never taken from the URL.
 */
export async function resolveJobNextStep(
  deps: JobNextStepDeps,
  input: { token: { eid: string; em: string }; requestedEngagementId: string },
): Promise<JobNextStep> {
  const engagementId = input.token.eid;
  if (input.requestedEngagementId !== engagementId) return { ok: false, status: 403, code: "token_mismatch" };

  const job = await deps.loadJob(engagementId);
  // Not a job (e.g. a dance waiver engagement): there is no next step here.
  if (!job) return { ok: false, status: 404, code: "not_job" };

  const email = input.token.em.trim().toLowerCase();
  const allowed = await deps.allowedEmails(engagementId, job.personId);
  if (!email || !allowed.has(email)) return { ok: false, status: 403, code: "email_mismatch" };
  if (!job.waiverEvidenceId) return { ok: false, status: 409, code: "not_signed" };

  const [accepted, requests] = await Promise.all([
    deps.loadAcceptedQuoteResult(engagementId),
    deps.loadRequests(engagementId),
  ]);
  const depositId = depositRequestIdFromAcceptResult(accepted);
  const deposit = collectableDeposit(requests, depositId, engagementId);
  if (deposit) {
    return {
      ok: true,
      next: "pay_deposit",
      payPath: depositPayPath(deposit.public_token),
      amountMinor: deposit.amount_minor,
      currency: deposit.currency,
    };
  }
  const paid = requests.some(
    (r) => r.id === depositId && r.engagement_id === engagementId && (r.status === "paid" || r.status === "refunded_manual"),
  );
  return { ok: true, next: "portal", portalPath: CLIENT_PORTAL_PATH, reason: paid ? "deposit_paid" : "no_deposit" };
}
