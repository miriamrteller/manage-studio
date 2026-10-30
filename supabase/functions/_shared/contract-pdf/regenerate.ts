/**
 * Admin "Generate PDF" for a job contract whose PDF failed at signing.
 *
 * The evidence row is immutable and its record_hmac seals the sentinel
 * pdf_sha256, so nothing here touches waiver_evidence. The PDF is rendered from
 * the sealed wording_snapshot (plus the job's current details for the header
 * block), uploaded under its own key, and recorded in waiver_evidence_pdfs —
 * documented as "generated after signing": it reproduces the sealed wording,
 * its own hash is not part of the sealed record. The PDF says so too.
 */
import type { JobContractContext } from "../job-contract.ts";
import { sha256Hex } from "../edge-runtime/hmac.ts";
import {
  CONTRACT_PDF_BUCKET,
  CONTRACT_PDF_CONTENT_TYPE,
  type ContractPdfDeps,
  type ContractPdfStorage,
  type ContractPdfTenant,
  defaultContractPdfDeps,
  hasStoredPdf,
  type RegeneratedContractPdf,
  regeneratedContractPdfStoragePath,
} from "./evidence.ts";

/** Loosely typed query client (see tenant-url.ts for why not SupabaseClient). */
export interface RegenerateClient {
  // deno-lint-ignore no-explicit-any -- chained Postgrest builder; only awaited
  from: (table: string) => any;
  storage: ContractPdfStorage;
}

export interface SealedEvidenceRow {
  id: string;
  pdf_storage_path: string;
  pdf_sha256: string;
  wording_snapshot: string;
  consent_template_id: string;
  consent_version: number;
  consent_version_hash: string;
  signed_at: string;
  signed_by_name: string;
  signed_by_email: string | null;
}

export type RegenerateResult =
  | { ok: true; pdf: RegeneratedContractPdf; created: boolean }
  | { ok: false; status: 409 | 404 | 500; error: string };

export async function regenerateContractPdf(
  client: RegenerateClient,
  input: {
    tenantId: string;
    tenant: ContractPdfTenant;
    language: "he" | "en";
    job: JobContractContext;
    actorId: string | null;
    now?: Date;
  },
  deps: ContractPdfDeps = defaultContractPdfDeps,
): Promise<RegenerateResult> {
  const { tenantId, job } = input;
  if (!job.waiverEvidenceId) return { ok: false, status: 409, error: "Contract not signed yet" };

  const { data: evidence } = await client
    .from("waiver_evidence")
    .select(
      "id, pdf_storage_path, pdf_sha256, wording_snapshot, consent_template_id, consent_version, consent_version_hash, signed_at, signed_by_name, signed_by_email",
    )
    .eq("id", job.waiverEvidenceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const row = evidence as SealedEvidenceRow | null;
  if (!row) return { ok: false, status: 404, error: "Signed contract not found" };
  if (hasStoredPdf(row)) {
    return { ok: false, status: 409, error: "This contract already has its sealed PDF" };
  }

  // Already generated once: reuse it (the sealed wording cannot have changed).
  const { data: existing } = await client
    .from("waiver_evidence_pdfs")
    .select("pdf_storage_path, pdf_sha256, generated_at")
    .eq("waiver_evidence_id", row.id)
    .maybeSingle();
  if (existing?.pdf_storage_path) {
    return { ok: true, pdf: existing as RegeneratedContractPdf, created: false };
  }

  const { data: template } = await client
    .from("consent_templates")
    .select("name")
    .eq("id", row.consent_template_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const now = input.now ?? new Date();
  const logo = await deps.fetchLogo(input.tenant.logo_url);
  const bytes = await deps.render({
    language: input.language,
    business: { name: input.tenant.name, logo },
    title: (template?.name as string | undefined) ?? "Contract",
    templateVersion: row.consent_version,
    wording: row.wording_snapshot,
    details: {
      clientName: job.fields.client_name,
      shootDate: job.fields.shoot_date,
      packageName: job.fields.package,
      location: job.fields.location,
      price: job.fields.price,
    },
    signature: {
      typedName: row.signed_by_name,
      signedAt: new Date(row.signed_at).toISOString(),
      signerEmail: row.signed_by_email,
      evidenceId: row.id,
      consentVersionHash: row.consent_version_hash,
      generatedAfterSigningAt: now.toISOString(),
    },
  });
  const pdfSha256 = await sha256Hex(bytes);
  const path = regeneratedContractPdfStoragePath(tenantId, job.engagementId, row.id, now);
  const { error: uploadError } = await client.storage
    .from(CONTRACT_PDF_BUCKET)
    .upload(path, bytes, { contentType: CONTRACT_PDF_CONTENT_TYPE, upsert: false });
  if (uploadError) return { ok: false, status: 500, error: `Could not store the PDF: ${uploadError.message}` };

  const pdf: RegeneratedContractPdf = { pdf_storage_path: path, pdf_sha256: pdfSha256, generated_at: now.toISOString() };
  const { error: insertError } = await client.from("waiver_evidence_pdfs").insert({
    waiver_evidence_id: row.id,
    tenant_id: tenantId,
    pdf_storage_path: path,
    pdf_sha256: pdfSha256,
    generated_at: pdf.generated_at,
    generated_by: input.actorId,
    reason: "generated_after_signing",
  });
  if (insertError) return { ok: false, status: 500, error: `Could not record the PDF: ${insertError.message}` };

  await client
    .from("job_details")
    .update({ contract_pdf_pending: false, updated_at: now.toISOString() })
    .eq("engagement_id", job.engagementId)
    .eq("tenant_id", tenantId);
  await client.from("audit_log").insert({
    tenant_id: tenantId,
    actor_id: input.actorId,
    action: "job_contract_pdf_generated",
    entity_type: "waiver_evidence",
    entity_id: row.id,
    after_state: { engagement_id: job.engagementId, pdf_storage_path: path, pdf_sha256: pdfSha256, reason: "generated_after_signing" },
  });
  return { ok: true, pdf, created: true };
}
