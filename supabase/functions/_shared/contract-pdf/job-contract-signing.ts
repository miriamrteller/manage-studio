/**
 * accept-waiver's job-contract branch, kept out of accept-waiver/index.ts so
 * the signing function's own diff stays small (Thread I edits the flow around
 * it). Covers: idempotent replay lookup, and the "contract signed" emails to
 * the client and the photographer with the PDF attached or linked.
 */
import { type EmailAttachment, supportsAttachments } from "../email-client.ts";
import type { JobContractContext } from "../job-contract.ts";
import {
  type AutomaticEmailOutcome,
  type AutomaticEmailTenant,
  type RpcClient,
  sendAutomaticEmail,
} from "../photographer-emails/send.ts";
import { tenantBaseUrl } from "../tenant-url.ts";
import { CONTRACT_PDF_BUCKET, CONTRACT_PDF_CONTENT_TYPE, contractPdfFilename, hasStoredPdf } from "./evidence.ts";
import { formatSignedAt } from "./render.ts";

/** Emailed download links live this long; the admin page and client portal mint fresh ones on demand. */
export const EMAIL_LINK_TTL_SECONDS = 72 * 3600;

export interface ExistingWaiverEvidence {
  id: string;
  pdf_storage_path: string;
  pdf_sha256: string;
  signed_at: string;
  signed_by_name: string;
  signed_by_email: string | null;
}

/**
 * Loosely typed query client (see tenant-url.ts): a structural
 * `from().select().eq().eq().maybeSingle()` type makes the TypeScript checker
 * instantiate supabase-js's generics "excessively deep".
 */
export interface EvidenceLookupClient {
  // deno-lint-ignore no-explicit-any -- chained Postgrest builder; only awaited
  from: (table: string) => any;
}

/**
 * A retry or double submit carries the same idempotency key. sign_waiver()
 * would return the existing row anyway, but by then a second PDF would have
 * been rendered and uploaded; looking first keeps the stored PDF the one whose
 * hash the record seals.
 */
export async function findExistingWaiverEvidence(
  client: EvidenceLookupClient,
  tenantId: string,
  idempotencyKey: string,
): Promise<ExistingWaiverEvidence | null> {
  const { data } = await client
    .from("waiver_evidence")
    .select("id, pdf_storage_path, pdf_sha256, signed_at, signed_by_name, signed_by_email")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return (data as ExistingWaiverEvidence | null) ?? null;
}

/** Loosely typed insert/update client for the failure record. */
export interface FailureRecordClient {
  // deno-lint-ignore no-explicit-any -- chained Postgrest builder; only awaited
  from: (table: string) => any;
}

/**
 * The PDF could not be rendered or stored at signing. The row is already
 * sealed with the sentinel pair (signing succeeded); here the failure becomes
 * visible: an audit_log row with the reason, and job_details.contract_pdf_pending
 * so the shoot page offers "Generate PDF". Never throws.
 */
export async function recordContractPdfFailure(
  client: FailureRecordClient,
  input: { tenantId: string; engagementId: string; evidenceId: string; reason: string },
): Promise<void> {
  try {
    const { error: auditError } = await client.from("audit_log").insert({
      tenant_id: input.tenantId,
      actor_id: null,
      action: "job_contract_pdf_failed",
      entity_type: "waiver_evidence",
      entity_id: input.evidenceId,
      after_state: { engagement_id: input.engagementId, reason: input.reason.slice(0, 1000), sealed_with: "sentinel" },
    });
    if (auditError) console.error("[job-contract-signing] audit_log insert failed:", auditError.message);
    const { error: flagError } = await client
      .from("job_details")
      .update({ contract_pdf_pending: true, updated_at: new Date().toISOString() })
      .eq("engagement_id", input.engagementId)
      .eq("tenant_id", input.tenantId);
    if (flagError) console.error("[job-contract-signing] contract_pdf_pending flag failed:", flagError.message);
  } catch (error) {
    console.error("[job-contract-signing] recordContractPdfFailure:", error);
  }
}

export interface SignedContractEvidence {
  id: string;
  storagePath: string;
  pdfSha256: string;
  signedAt: string;
  typedName: string;
  signedByEmail: string | null;
}

export interface ContractEmailTenant extends AutomaticEmailTenant {
  contact_email: string;
}

/** Structural storage client for the signed link and (on replay) the stored bytes. */
export interface ContractEmailStorage {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresIn: number,
      options?: { download?: string | boolean },
    ): PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
  };
}

export interface NotifyJobContractSignedInput {
  tenant: ContractEmailTenant;
  language: "he" | "en";
  job: JobContractContext;
  evidence: SignedContractEvidence;
  /** Freshly rendered bytes; null on a replay (then fetched from storage for the attachment). */
  pdfBytes: Uint8Array | null;
}

export interface NotifyDeps {
  /** Transport override for tests; undefined means the real sendHtmlEmail. */
  send?: Parameters<typeof sendAutomaticEmail>[2];
  attachmentsSupported: () => boolean;
}

export interface NotifyResult {
  client: AutomaticEmailOutcome | "no_recipient";
  studio: AutomaticEmailOutcome | "no_recipient";
  downloadUrl: string | null;
}

async function signedDownloadUrl(storage: ContractEmailStorage, evidence: SignedContractEvidence): Promise<string | null> {
  if (!hasStoredPdf({ pdf_storage_path: evidence.storagePath, pdf_sha256: evidence.pdfSha256 })) return null;
  const { data, error } = await storage
    .from(CONTRACT_PDF_BUCKET)
    .createSignedUrl(evidence.storagePath, EMAIL_LINK_TTL_SECONDS, { download: contractPdfFilename(evidence.id) });
  if (error || !data?.signedUrl) {
    console.error("[job-contract-signing] signed URL failed (emails will link to the app instead):", error?.message);
    return null;
  }
  return data.signedUrl;
}

async function attachmentFor(
  storage: ContractEmailStorage,
  evidence: SignedContractEvidence,
  bytes: Uint8Array | null,
): Promise<EmailAttachment[] | undefined> {
  let content = bytes;
  if (!content && hasStoredPdf({ pdf_storage_path: evidence.storagePath, pdf_sha256: evidence.pdfSha256 })) {
    const { data, error } = await storage.from(CONTRACT_PDF_BUCKET).download(evidence.storagePath);
    if (error || !data) {
      console.error("[job-contract-signing] could not read stored PDF for the attachment:", error?.message);
      return undefined;
    }
    content = new Uint8Array(await data.arrayBuffer());
  }
  if (!content) return undefined;
  return [{ filename: contractPdfFilename(evidence.id), content, contentType: CONTRACT_PDF_CONTENT_TYPE }];
}

/**
 * Email the signed contract to the client (the signer) and to the studio.
 *
 * At most once per recipient per shoot: both sends are claimed in
 * automatic_email_log (keys contract_signed_client / contract_signed_studio,
 * keyed by engagement), so a retry of accept-waiver or a double submit sends
 * nothing twice; a failed send is retried by the next attempt (up to 3).
 *
 * The PDF is attached when the transport takes attachments (Resend). The body
 * always carries a download link too: a 72-hour signed URL when storage can
 * mint one, else the client portal / admin shoot page, which issue fresh links.
 *
 * Never throws — the contract is signed whether or not the mail goes out.
 */
export async function notifyJobContractSigned(
  client: RpcClient & { storage: ContractEmailStorage },
  input: NotifyJobContractSignedInput,
  deps: NotifyDeps = { attachmentsSupported: supportsAttachments },
): Promise<NotifyResult> {
  const result: NotifyResult = { client: "no_recipient", studio: "no_recipient", downloadUrl: null };
  try {
    const { tenant, job, evidence, language } = input;
    const base = tenantBaseUrl(tenant.subdomain);
    const signedUrl = await signedDownloadUrl(client.storage, evidence);
    result.downloadUrl = signedUrl;
    const attachments = deps.attachmentsSupported() ? await attachmentFor(client.storage, evidence, input.pdfBytes) : undefined;

    const shared = {
      shootDate: job.fields.shoot_date,
      packageName: job.fields.package,
      signedAt: formatSignedAt(evidence.signedAt, language),
    };

    const clientEmail = (evidence.signedByEmail ?? job.clientEmail ?? "").trim().toLowerCase();
    if (clientEmail.includes("@")) {
      result.client = await sendAutomaticEmail(client, {
        tenant,
        key: "contract_signed_client",
        engagementId: job.engagementId,
        to: clientEmail,
        variables: { ...shared, recipientName: job.fields.client_name, downloadUrl: signedUrl ?? `${base}/dashboard/portal` },
        attachments,
      }, deps.send);
    }

    const studioEmail = (tenant.contact_email ?? "").trim().toLowerCase();
    if (studioEmail.includes("@")) {
      result.studio = await sendAutomaticEmail(client, {
        tenant,
        key: "contract_signed_studio",
        engagementId: job.engagementId,
        to: studioEmail,
        variables: {
          ...shared,
          clientName: job.fields.client_name,
          downloadUrl: signedUrl ?? `${base}/admin/jobs/${job.engagementId}`,
        },
        attachments,
      }, deps.send);
    }
  } catch (error) {
    console.error("[job-contract-signing] contract emails failed (signing already recorded):", error);
  }
  return result;
}
