/**
 * Signed-contract PDF as part of the waiver evidence record (Thread G).
 *
 * accept-waiver seals 15 canonical fields with record_hmac, one of which is
 * pdf_sha256. Dance waivers keep the V1 behaviour — no PDF, the sentinel path
 * and a zeroed hash — because their evidence row is the operative record and
 * nothing downstream reads a PDF. Job (photographer) contracts render and
 * upload the PDF BEFORE the evidence insert, so the real pdf_sha256 is inside
 * the sealed record and the existing verifier (verify-waiver-evidence.ts)
 * checks it unchanged: the canonical form is the same 15 fields, only the
 * value of pdf_sha256 is now meaningful.
 *
 * Everything accept-waiver needs lives here so its own diff stays small.
 */
import { hmacSha256Hex, sha256Hex } from "../edge-runtime/hmac.ts";
import type { JobContractContext } from "../job-contract.ts";
import { type ContractPdfInput, type ContractPdfLogo, renderContractPdf } from "./render.ts";

/** V1 sentinel pair: stored when no PDF exists (every dance waiver, and every job contract signed before Thread G). */
export const PDF_DEFERRED_SENTINEL = "v1-deferred";
export const PDF_SHA256_NONE = "0".repeat(64);

export const CONTRACT_PDF_BUCKET = "legal-documents";
export const CONTRACT_PDF_CONTENT_TYPE = "application/pdf";

/** Tenant-scoped object key; the evidence id makes it unique per signing attempt. */
export function contractPdfStoragePath(tenantId: string, engagementId: string, evidenceId: string): string {
  return `contracts/${tenantId}/${engagementId}/${evidenceId}.pdf`;
}

/** Key for a PDF generated after signing (admin retry); distinct from the sealed path. */
export function regeneratedContractPdfStoragePath(
  tenantId: string,
  engagementId: string,
  evidenceId: string,
  generatedAt: Date,
): string {
  const stamp = generatedAt.toISOString().replace(/[-:.]/g, "").slice(0, 15);
  return `contracts/${tenantId}/${engagementId}/${evidenceId}-after-signing-${stamp}.pdf`;
}

/** Row of waiver_evidence_pdfs: a PDF generated after signing for a sentinel evidence row. */
export interface RegeneratedContractPdf {
  pdf_storage_path: string;
  pdf_sha256: string;
  generated_at: string;
}

export interface ContractPdfLocation {
  path: string;
  sha256: string;
  /** "sealed": the hash is inside record_hmac. "after_signing": rendered later from the sealed wording. */
  source: "sealed" | "after_signing";
}

/** Where a signed contract's PDF is, if anywhere: the sealed object, else a regenerated one. */
export function contractPdfLocation(
  evidence: { pdf_storage_path: string | null; pdf_sha256: string | null } | null,
  regenerated: RegeneratedContractPdf | null,
): ContractPdfLocation | null {
  if (!evidence) return null;
  if (hasStoredPdf(evidence)) {
    return { path: evidence.pdf_storage_path as string, sha256: evidence.pdf_sha256 as string, source: "sealed" };
  }
  if (regenerated?.pdf_storage_path) {
    return { path: regenerated.pdf_storage_path, sha256: regenerated.pdf_sha256, source: "after_signing" };
  }
  return null;
}

/** Suggested download name for the signed PDF. */
export function contractPdfFilename(evidenceId: string): string {
  return `signed-contract-${evidenceId.slice(0, 8)}.pdf`;
}

/** True when the evidence row points at a real PDF rather than the V1 sentinel. */
export function hasStoredPdf(row: { pdf_storage_path: string | null; pdf_sha256: string | null }): boolean {
  return Boolean(row.pdf_storage_path) &&
    row.pdf_storage_path !== PDF_DEFERRED_SENTINEL &&
    Boolean(row.pdf_sha256) &&
    row.pdf_sha256 !== PDF_SHA256_NONE;
}

/** The 15 fields sealed by record_hmac, in the shape accept-waiver builds (SPEC §4.2.9). */
export interface WaiverRecordFields {
  accept_language: string | null;
  consent_template_id: string;
  consent_version: number;
  consent_version_hash: string;
  guardian_confirmed: boolean;
  idempotency_key: string;
  ip_address: string | null;
  pdf_sha256: string;
  person_id: string;
  signed_at: string;
  signed_by_email: string | null;
  signed_by_name: string;
  signed_by_role: string;
  tenant_id: string;
  user_agent: string | null;
}

/** Canonical JSON: keys alphabetical, no whitespace — byte-identical to the verifier's canonicalise(). */
export function waiverRecordCanonical(fields: WaiverRecordFields): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))),
  );
}

export function waiverRecordHmac(key: string, fields: WaiverRecordFields): Promise<string> {
  return hmacSha256Hex(key, waiverRecordCanonical(fields));
}

export interface WaiverPdfArtifact {
  storagePath: string;
  pdfSha256: string;
  /** The rendered bytes (for the email attachment); null when nothing was rendered. */
  bytes: Uint8Array | null;
  /**
   * Set when a job contract's PDF could not be rendered or stored: the row is
   * then sealed with the sentinel pair and the shoot is flagged for the admin
   * "Generate PDF" retry (see recordContractPdfFailure).
   */
  failure?: string;
}

/** What a dance waiver — or anything that is not a job contract — stores. */
export const NO_PDF: WaiverPdfArtifact = {
  storagePath: PDF_DEFERRED_SENTINEL,
  pdfSha256: PDF_SHA256_NONE,
  bytes: null,
};

export interface ContractPdfTenant {
  name: string;
  logo_url: string | null;
}

export interface JobContractPdfInput {
  tenant: ContractPdfTenant;
  language: "he" | "en";
  job: JobContractContext;
  template: { name: string; version: number };
  wordingSnapshot: string;
  evidenceId: string;
  typedName: string;
  signedAt: string;
  signerEmail: string | null;
  consentVersionHash: string;
}

/** Structural storage client (supabase-js `storage`), so tests can pass a fake. */
export interface ContractPdfStorage {
  from(bucket: string): {
    upload(
      path: string,
      body: Uint8Array,
      options: { contentType: string; upsert: boolean },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface ContractPdfDeps {
  render: (input: ContractPdfInput) => Promise<Uint8Array>;
  fetchLogo: (url: string | null) => Promise<ContractPdfLogo | null>;
}

const LOGO_TIMEOUT_MS = 5_000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Best effort: the PDF is rendered without a logo if the URL is slow, large or not PNG/JPEG. */
export async function fetchTenantLogo(url: string | null): Promise<ContractPdfLogo | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/png", "image/jpeg", "image/jpg"].includes(mimeType)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null;
    return { bytes, mimeType };
  } catch (error) {
    console.warn("[contract-pdf] logo fetch failed, rendering without it:", error);
    return null;
  }
}

export const defaultContractPdfDeps: ContractPdfDeps = {
  render: renderContractPdf,
  fetchLogo: fetchTenantLogo,
};

/** Render the signed job contract and hash the bytes. Pure apart from the logo fetch. */
export async function buildJobContractPdf(
  input: JobContractPdfInput,
  deps: ContractPdfDeps = defaultContractPdfDeps,
): Promise<{ bytes: Uint8Array; pdfSha256: string }> {
  const logo = await deps.fetchLogo(input.tenant.logo_url);
  const bytes = await deps.render({
    language: input.language,
    business: { name: input.tenant.name, logo },
    title: input.template.name,
    templateVersion: input.template.version,
    wording: input.wordingSnapshot,
    details: {
      clientName: input.job.fields.client_name,
      shootDate: input.job.fields.shoot_date,
      packageName: input.job.fields.package,
      location: input.job.fields.location,
      price: input.job.fields.price,
    },
    signature: {
      typedName: input.typedName,
      signedAt: input.signedAt,
      signerEmail: input.signerEmail,
      evidenceId: input.evidenceId,
      consentVersionHash: input.consentVersionHash,
    },
  });
  return { bytes, pdfSha256: await sha256Hex(bytes) };
}

/**
 * Decide and produce the PDF half of a waiver evidence record.
 *
 * - Not a job contract (`job` null): the V1 sentinel pair, nothing rendered,
 *   nothing uploaded — today's dance-waiver behaviour, byte for byte.
 * - Job contract: render, hash, upload to the legal-documents bucket under a
 *   tenant-scoped key, and return the real path + hash for the sealed record.
 *
 * Never throws for a job contract. A render or upload failure must not stop a
 * client from signing a legal contract, so the artifact degrades to the same
 * sentinel pair a dance waiver stores (the verifier already accepts it) with
 * `failure` set; accept-waiver then flags the shoot and logs it, and the admin
 * "Generate PDF" retry renders the PDF later from the sealed wording.
 */
export async function prepareWaiverPdf(
  storage: ContractPdfStorage,
  params: { job: JobContractContext | null; tenantId: string } & Omit<JobContractPdfInput, "job">,
  deps: ContractPdfDeps = defaultContractPdfDeps,
): Promise<WaiverPdfArtifact> {
  if (!params.job) return NO_PDF;

  try {
    const { bytes, pdfSha256 } = await buildJobContractPdf({ ...params, job: params.job }, deps);
    const storagePath = contractPdfStoragePath(params.tenantId, params.job.engagementId, params.evidenceId);
    const { error } = await storage
      .from(CONTRACT_PDF_BUCKET)
      .upload(storagePath, bytes, { contentType: CONTRACT_PDF_CONTENT_TYPE, upsert: false });
    if (error) throw new Error(`upload failed: ${error.message}`);
    return { storagePath, pdfSha256, bytes };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[contract-pdf] PDF failed at signing; sealing with the sentinel pair:", reason);
    return { ...NO_PDF, failure: reason };
  }
}
